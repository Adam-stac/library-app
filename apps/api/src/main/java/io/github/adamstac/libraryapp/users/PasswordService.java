package io.github.adamstac.libraryapp.users;

import io.github.adamstac.libraryapp.FieldValidationException;
import io.github.adamstac.libraryapp.InvalidRequestException;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Forgotten passwords (reset by email link) and changing the password while signed in. */
@Service
class PasswordService {

    static final int MAX_RESET_EMAILS_PER_HOUR = 3;

    private static final Logger log = LoggerFactory.getLogger(PasswordService.class);

    private final JdbcClient jdbc;
    private final PasswordHashing passwordHashing;
    private final NewPasswordRules newPasswords;
    private final LoginService logins;
    private final MailDispatcher mail;
    private final String baseUrl;

    PasswordService(
            JdbcClient jdbc,
            PasswordHashing passwordHashing,
            NewPasswordRules newPasswords,
            LoginService logins,
            MailDispatcher mail,
            @Value("${app.base-url}") String baseUrl) {
        this.jdbc = jdbc;
        this.passwordHashing = passwordHashing;
        this.newPasswords = newPasswords;
        this.logins = logins;
        this.mail = mail;
        this.baseUrl = baseUrl;
    }

    private record StoredUser(UUID id, String email, String passwordHash, String language, boolean locked) {}

    /**
     * Emails a one-hour reset link if the address has an account. The caller always gets the same answer,
     * and the email is sent in the background, so nobody can tell whether an account exists.
     */
    @Transactional
    void requestReset(String rawEmail) {
        Optional<StoredUser> found = userWhere("email = :value", EmailAddresses.normalize(rawEmail));
        if (found.isEmpty()) {
            return; // No email: we never send mail to addresses without an account
        }
        StoredUser user = found.get();

        long recent = jdbc.sql("""
                        SELECT count(*) FROM password_resets
                        WHERE user_id = :id AND created_at > now() - interval '1 hour'
                        """)
                .param("id", user.id())
                .query(Long.class)
                .single();
        if (recent >= MAX_RESET_EMAILS_PER_HOUR) {
            log.warn("Password reset email limit reached for account {}; no email sent", user.id());
            return;
        }

        String token = Tokens.generate();
        jdbc.sql("""
                        INSERT INTO password_resets (id, user_id, token_hash, expires_at)
                        VALUES (:id, :userId, :tokenHash, now() + interval '1 hour')
                        """)
                .param("id", UUID.randomUUID())
                .param("userId", user.id())
                .param("tokenHash", Tokens.hash(token))
                .update();
        log.info("Password reset requested for account {}", user.id());

        // The token goes after '#', so it never reaches server or proxy logs
        mail.sendAfterCommit(
                user.email(), AccountEmails.passwordReset(user.language(), baseUrl + "/reset-password#token=" + token));
    }

    /**
     * Sets a new password from a reset link. Also: every reset link for the account stops working, the
     * temporary lock is lifted, every session is ended (anyone who had the old password is signed out),
     * and the owner is told by email.
     */
    @Transactional
    void resetPassword(String token, String rawPassword) {
        UUID userId = jdbc.sql("""
                        SELECT user_id FROM password_resets
                        WHERE token_hash = :tokenHash AND expires_at > now()
                        FOR UPDATE
                        """)
                .param("tokenHash", Tokens.hash(token))
                .query((rs, rowNum) -> rs.getObject("user_id", UUID.class))
                .optional()
                .orElseThrow(() -> new InvalidRequestException("invalid_token"));

        String password = PasswordPolicy.normalize(rawPassword);
        newPasswords.check(password, "password"); // on failure nothing changes and the link still works

        StoredUser user = userWhere("id = :value", userId).orElseThrow(() -> new InvalidRequestException("invalid_token"));
        savePassword(user.id(), passwordHashing.hash(password));
        jdbc.sql("UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = :id")
                .param("id", user.id())
                .update();
        int ended = jdbc.sql("DELETE FROM spring_session WHERE principal_name = :name")
                .param("name", user.id().toString())
                .update();
        log.info("Password reset for account {}; {} session(s) ended", user.id(), ended);
        mail.sendAfterCommit(user.email(), AccountEmails.passwordChanged(user.language(), forgotPasswordLink()));
    }

    /**
     * Changes the password of the signed-in account. The current password is required (a stolen session
     * alone isn't enough) and wrong guesses count towards the sign-in lock. Every other session is ended.
     */
    @Transactional(noRollbackFor = FieldValidationException.class) // keep the wrong-guess count
    void changePassword(UUID userId, String currentSessionId, String rawCurrent, String rawNew) {
        StoredUser user = userWhere("id = :value FOR UPDATE", userId)
                .orElseThrow(() -> new InvalidRequestException("signed_out"));

        boolean correct = passwordHashing.matches(PasswordPolicy.normalize(rawCurrent), user.passwordHash());
        if (!correct || user.locked()) {
            if (!correct) {
                logins.recordWrongPassword(user.id());
            }
            log.info("Wrong current password when changing password for account {}", user.id());
            throw new FieldValidationException("currentPassword", "incorrect");
        }

        String password = PasswordPolicy.normalize(rawNew);
        newPasswords.check(password, "newPassword");

        savePassword(user.id(), passwordHashing.hash(password));
        int ended = jdbc.sql("DELETE FROM spring_session WHERE principal_name = :name AND session_id <> :current")
                .param("name", user.id().toString())
                .param("current", currentSessionId)
                .update();
        log.info("Password changed for account {}; {} other session(s) ended", user.id(), ended);
        mail.sendAfterCommit(user.email(), AccountEmails.passwordChanged(user.language(), forgotPasswordLink()));
    }

    /** The new hash replaces the old one, and any reset links still waiting stop working. */
    private void savePassword(UUID userId, String hash) {
        jdbc.sql("UPDATE users SET password_hash = :hash, updated_at = now() WHERE id = :id")
                .param("hash", hash)
                .param("id", userId)
                .update();
        jdbc.sql("DELETE FROM password_resets WHERE user_id = :id").param("id", userId).update();
    }

    private String forgotPasswordLink() {
        return baseUrl + "/forgot-password";
    }

    /** {@code condition} is always a fixed string from this class; the value is bound as a parameter. */
    private Optional<StoredUser> userWhere(String condition, Object value) {
        return jdbc.sql("""
                        SELECT id, email, password_hash, preferred_language,
                               (locked_until IS NOT NULL AND locked_until > now()) AS locked
                        FROM users WHERE\s""" + condition)
                .param("value", value)
                .query((rs, rowNum) -> new StoredUser(
                        rs.getObject("id", UUID.class),
                        rs.getString("email"),
                        rs.getString("password_hash"),
                        rs.getString("preferred_language"),
                        rs.getBoolean("locked")))
                .optional();
    }
}
