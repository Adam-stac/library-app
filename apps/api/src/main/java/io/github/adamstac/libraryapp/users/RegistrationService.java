package io.github.adamstac.libraryapp.users;

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
    private final NewPasswordRules newPasswords;
    private final MailDispatcher mail;
    private final SecurityEvents events;
    private final String baseUrl;

    RegistrationService(
            JdbcClient jdbc,
            PasswordHashing passwordHashing,
            NewPasswordRules newPasswords,
            MailDispatcher mail,
            SecurityEvents events,
            @Value("${app.base-url}") String baseUrl) {
        this.events = events;
        this.jdbc = jdbc;
        this.passwordHashing = passwordHashing;
        this.newPasswords = newPasswords;
        this.mail = mail;
        this.baseUrl = baseUrl;
    }

    /** Always ends the same way for the caller, whether or not the email has an account. */
    @Transactional
    void register(String rawEmail, String rawPassword, String language) {
        String email = EmailAddresses.normalize(rawEmail);
        String password = PasswordPolicy.normalize(rawPassword);

        newPasswords.check(password, "password");

        // Hash on every path, so new and existing emails take the same time (no enumeration by timing)
        String passwordHash = passwordHashing.hash(password);

        UUID existing = accountId(email);
        if (existing != null) {
            // The owner is told, at most 3 times an hour, so this can't be used to flood their inbox
            long recent = jdbc.sql("""
                            SELECT count(*) FROM security_events
                            WHERE user_id = :id AND type = :type AND occurred_at > now() - interval '1 hour'
                            """)
                    .param("id", existing)
                    .param("type", SecurityEvents.REGISTRATION_ATTEMPT)
                    .query(Long.class)
                    .single();
            if (recent >= MAX_EMAILS_PER_ADDRESS_PER_HOUR) {
                log.warn("Registration notice limit reached for account {}; no email sent", existing);
                return;
            }
            events.record(existing, SecurityEvents.REGISTRATION_ATTEMPT);
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

    private UUID accountId(String email) {
        return jdbc.sql("SELECT id FROM users WHERE email = :email")
                .param("email", email)
                .query(UUID.class)
                .optional()
                .orElse(null);
    }

    private record Pending(String email, String passwordHash, String language) {}
}
