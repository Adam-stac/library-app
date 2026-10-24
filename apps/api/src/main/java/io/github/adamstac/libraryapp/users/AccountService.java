package io.github.adamstac.libraryapp.users;

import io.github.adamstac.libraryapp.FieldValidationException;
import io.github.adamstac.libraryapp.InvalidRequestException;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Account settings: the language emails are sent in, changing the email address, and deleting the account. */
@Service
class AccountService {

    static final int MAX_EMAIL_CHANGES_PER_HOUR = 3;
    /** Across all accounts, so several accounts can't be used together to flood one stranger's inbox. */
    static final int MAX_EMAILS_PER_NEW_ADDRESS_PER_HOUR = 3;

    private static final Logger log = LoggerFactory.getLogger(AccountService.class);

    private final JdbcClient jdbc;
    private final LoginService logins;
    private final TwoFactorService twoFactor;
    private final MailDispatcher mail;
    private final SecurityEvents events;
    private final String baseUrl;

    AccountService(
            JdbcClient jdbc,
            LoginService logins,
            TwoFactorService twoFactor,
            MailDispatcher mail,
            SecurityEvents events,
            @Value("${app.base-url}") String baseUrl) {
        this.jdbc = jdbc;
        this.logins = logins;
        this.twoFactor = twoFactor;
        this.mail = mail;
        this.events = events;
        this.baseUrl = baseUrl;
    }

    private record Owner(String email, String language) {}

    // ---- Language ---------------------------------------------------------------------------------------------

    /** The language for emails. Not a security change, so no password is needed. */
    @Transactional
    void setLanguage(UUID userId, String language) {
        jdbc.sql("UPDATE users SET preferred_language = :language, updated_at = now() WHERE id = :id")
                .param("language", language)
                .param("id", userId)
                .update();
    }

    // ---- Email address ----------------------------------------------------------------------------------------

    /**
     * Starts changing the email address: needs the password (and a code, with two-step verification on). A link
     * goes to the new address and a warning to the current one. The answer is the same whether or not the new
     * address already has an account; if it does, that address is told instead, and nothing changes.
     */
    @Transactional(noRollbackFor = FieldValidationException.class) // keep the wrong-guess count
    void requestEmailChange(UUID userId, String currentPassword, String code, String rawNewEmail) {
        logins.requirePassword(userId, currentPassword, "currentPassword");
        twoFactor.requireCodeIfEnabled(userId, code);

        Owner owner = owner(userId);
        String newEmail = EmailAddresses.normalize(rawNewEmail);
        if (newEmail.equals(owner.email())) {
            throw new FieldValidationException("newEmail", "same_email");
        }

        long recent = jdbc.sql("""
                        SELECT count(*) FROM email_changes
                        WHERE user_id = :id AND created_at > now() - interval '1 hour'
                        """)
                .param("id", userId)
                .query(Long.class)
                .single();
        if (recent >= MAX_EMAIL_CHANGES_PER_HOUR) {
            log.warn("Email change limit reached for account {}; no email sent", userId);
            return;
        }
        long toThisAddress = jdbc.sql("""
                        SELECT count(*) FROM email_changes
                        WHERE new_email = :email AND created_at > now() - interval '1 hour'
                        """)
                .param("email", newEmail)
                .query(Long.class)
                .single();
        if (toThisAddress >= MAX_EMAILS_PER_NEW_ADDRESS_PER_HOUR) {
            log.warn("Email change limit reached for an address (asked by account {}); no email sent", userId);
            return;
        }

        // Only the newest link works
        jdbc.sql("UPDATE email_changes SET expires_at = now() WHERE user_id = :id AND expires_at > now()")
                .param("id", userId)
                .update();
        String token = Tokens.generate();
        jdbc.sql("""
                        INSERT INTO email_changes (id, user_id, new_email, token_hash, expires_at)
                        VALUES (:id, :userId, :newEmail, :tokenHash, now() + interval '1 hour')
                        """)
                .param("id", UUID.randomUUID())
                .param("userId", userId)
                .param("newEmail", newEmail)
                .param("tokenHash", Tokens.hash(token))
                .update();
        log.info("Email change requested for account {}", userId);
        events.record(userId, SecurityEvents.EMAIL_CHANGE_REQUESTED, mask(newEmail));

        if (accountExists(newEmail)) {
            mail.sendAfterCommit(newEmail, AccountEmails.emailChangeAddressTaken(owner.language()));
        } else {
            // The token goes after '#', so it never reaches server or proxy logs
            mail.sendAfterCommit(newEmail, AccountEmails.confirmNewEmail(
                    owner.language(), baseUrl + "/confirm-email-change#token=" + token));
        }
        mail.sendAfterCommit(owner.email(), AccountEmails.emailChangeRequested(
                owner.language(), mask(newEmail), baseUrl + "/security"));
    }

    /**
     * Finishes the change from the link sent to the new address. Every other session ends, reset links sent to the
     * old address stop working, and the old address is told. Works whether or not the person is signed in here.
     *
     * @param signedInAs the account signed in on this request, if any, and {@code currentSessionId} its session:
     *     that session is kept when it belongs to the same account
     */
    @Transactional
    void confirmEmailChange(String token, String signedInAs, String currentSessionId) {
        record Change(UUID userId, String newEmail) {}
        Change change = jdbc.sql("""
                        SELECT user_id, new_email FROM email_changes
                        WHERE token_hash = :tokenHash AND expires_at > now()
                        FOR UPDATE
                        """)
                .param("tokenHash", Tokens.hash(token))
                .query((rs, rowNum) -> new Change(rs.getObject("user_id", UUID.class), rs.getString("new_email")))
                .optional()
                .orElseThrow(() -> new InvalidRequestException("invalid_token"));
        Owner before = owner(change.userId());

        int updated = jdbc.sql("""
                        UPDATE users SET email = :email, updated_at = now()
                        WHERE id = :id AND NOT EXISTS (SELECT 1 FROM users WHERE email = :email)
                        """)
                .param("email", change.newEmail())
                .param("id", change.userId())
                .update();
        jdbc.sql("DELETE FROM email_changes WHERE user_id = :id").param("id", change.userId()).update();
        if (updated == 0) {
            // Someone registered the address after the link was sent
            throw new InvalidRequestException("invalid_token");
        }
        jdbc.sql("DELETE FROM password_resets WHERE user_id = :id").param("id", change.userId()).update();

        boolean sameAccount = change.userId().toString().equals(signedInAs);
        int ended = logins.endOtherSessions(change.userId(), sameAccount ? currentSessionId : "");
        log.info("Email changed for account {}; {} session(s) ended", change.userId(), ended);
        events.record(change.userId(), SecurityEvents.EMAIL_CHANGED, mask(change.newEmail()));
        mail.sendAfterCommit(before.email(), AccountEmails.emailChanged(before.language(), mask(change.newEmail())));
    }

    /** Data minimisation: expired email-change links are deleted. */
    @Scheduled(cron = "0 29 * * * *") // every hour, at 29 minutes past
    void runHourly() {
        deleteExpiredEmailChanges();
    }

    int deleteExpiredEmailChanges() {
        return jdbc.sql("DELETE FROM email_changes WHERE expires_at < now() - interval '1 hour'").update();
    }

    // ---- Deleting the account ---------------------------------------------------------------------------------

    /**
     * Deletes the account and everything that belongs to it, at once and for good. Needs the password (and a code,
     * with two-step verification on). Every session ends, and a last email confirms it.
     */
    @Transactional(noRollbackFor = FieldValidationException.class) // keep the wrong-guess count
    void deleteAccount(UUID userId, String currentPassword, String code) {
        logins.requirePassword(userId, currentPassword, "currentPassword");
        twoFactor.requireCodeIfEnabled(userId, code);

        Owner owner = owner(userId);
        jdbc.sql("DELETE FROM spring_session WHERE principal_name = :name")
                .param("name", userId.toString())
                .update();
        // Everything else that belongs to the account goes with it (ON DELETE CASCADE)
        jdbc.sql("DELETE FROM users WHERE id = :id").param("id", userId).update();
        log.info("Account {} deleted by its owner", userId);
        mail.sendAfterCommit(owner.email(), AccountEmails.accountDeleted(owner.language()));
    }

    // ---- Helpers ----------------------------------------------------------------------------------------------

    /** "ahmad@example.com" becomes "a•••@example.com": enough to recognise, not enough to harvest. */
    static String mask(String email) {
        int at = email.lastIndexOf('@');
        if (at < 1) {
            return "•••";
        }
        return email.charAt(0) + "•••" + email.substring(at);
    }

    private Owner owner(UUID userId) {
        return jdbc.sql("SELECT email, preferred_language FROM users WHERE id = :id")
                .param("id", userId)
                .query((rs, rowNum) -> new Owner(rs.getString("email"), rs.getString("preferred_language")))
                .optional()
                .orElseThrow(() -> new InvalidRequestException("signed_out"));
    }

    private boolean accountExists(String email) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM users WHERE email = :email)")
                .param("email", email)
                .query(Boolean.class)
                .single();
    }
}
