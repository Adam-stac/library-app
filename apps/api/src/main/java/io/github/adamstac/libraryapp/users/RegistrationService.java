package io.github.adamstac.libraryapp.users;

import io.github.adamstac.libraryapp.FieldValidationException;
import io.github.adamstac.libraryapp.InvalidRequestException;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class RegistrationService {

    static final int MAX_EMAILS_PER_ADDRESS_PER_HOUR = 3;

    private static final Logger log = LoggerFactory.getLogger(RegistrationService.class);

    private final JdbcClient jdbc;
    private final PasswordHashing passwordHashing;
    private final PasswordBreachCheck breachCheck;
    private final MailDispatcher mail;
    private final String baseUrl;

    RegistrationService(
            JdbcClient jdbc,
            PasswordHashing passwordHashing,
            PasswordBreachCheck breachCheck,
            MailDispatcher mail,
            @Value("${app.base-url}") String baseUrl) {
        this.jdbc = jdbc;
        this.passwordHashing = passwordHashing;
        this.breachCheck = breachCheck;
        this.mail = mail;
        this.baseUrl = baseUrl;
    }

    /** Always ends the same way for the caller, whether or not the email has an account. */
    @Transactional
    void register(String rawEmail, String rawPassword, String language) {
        String email = EmailAddresses.normalize(rawEmail);
        String password = PasswordPolicy.normalize(rawPassword);

        int length = PasswordPolicy.length(password);
        if (length < PasswordPolicy.MIN_LENGTH) {
            throw new FieldValidationException("password", "too_short");
        }
        if (length > PasswordPolicy.MAX_LENGTH) {
            throw new FieldValidationException("password", "too_long");
        }
        if (breachCheck.isCompromised(password)) {
            throw new FieldValidationException("password", "compromised");
        }

        // Hash on every path, so new and existing emails take the same time (no enumeration by timing)
        String passwordHash = passwordHashing.hash(password);

        if (accountExists(email)) {
            mail.sendAfterCommit(email, RegistrationEmails.alreadyRegistered(language));
            return;
        }

        long recentAttempts = jdbc.sql("""
                        SELECT count(*) FROM pending_registrations
                        WHERE email = :email AND created_at > now() - interval '1 hour'
                        """)
                .param("email", email)
                .query(Long.class)
                .single();
        if (recentAttempts >= MAX_EMAILS_PER_ADDRESS_PER_HOUR) {
            log.warn("Registration email limit reached for an address; no email sent");
            return;
        }

        String token = Tokens.generate();
        jdbc.sql("""
                        INSERT INTO pending_registrations
                            (id, email, password_hash, preferred_language, token_hash, expires_at)
                        VALUES (:id, :email, :passwordHash, :language, :tokenHash, now() + interval '24 hours')
                        """)
                .param("id", UUID.randomUUID())
                .param("email", email)
                .param("passwordHash", passwordHash)
                .param("language", language)
                .param("tokenHash", Tokens.hash(token))
                .update();

        // The token goes after '#', so it never reaches server or proxy logs
        mail.sendAfterCommit(email, RegistrationEmails.verification(language, baseUrl + "/verify-email#token=" + token));
    }

    /** Creates the account from the registration attempt this link belongs to. */
    @Transactional
    void verify(String token) {
        Pending pending = jdbc.sql("""
                        SELECT email, password_hash, preferred_language FROM pending_registrations
                        WHERE token_hash = :tokenHash AND expires_at > now()
                        FOR UPDATE
                        """)
                .param("tokenHash", Tokens.hash(token))
                .query((rs, rowNum) -> new Pending(
                        rs.getString("email"), rs.getString("password_hash"), rs.getString("preferred_language")))
                .optional()
                .orElseThrow(() -> new InvalidRequestException("invalid_token"));

        // All other attempts for this email become invalid once one is verified
        jdbc.sql("DELETE FROM pending_registrations WHERE email = :email")
                .param("email", pending.email())
                .update();

        int created = jdbc.sql("""
                        INSERT INTO users (id, email, password_hash, preferred_language)
                        VALUES (:id, :email, :passwordHash, :language)
                        ON CONFLICT (email) DO NOTHING
                        """)
                .param("id", UUID.randomUUID())
                .param("email", pending.email())
                .param("passwordHash", pending.passwordHash())
                .param("language", pending.language())
                .update();
        if (created == 1) {
            log.info("Account created after email verification");
        }
    }

    private boolean accountExists(String email) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM users WHERE email = :email)")
                .param("email", email)
                .query(Boolean.class)
                .single();
    }

    private record Pending(String email, String passwordHash, String language) {}
}
