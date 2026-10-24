package io.github.adamstac.libraryapp.users;

import io.github.adamstac.libraryapp.FieldValidationException;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class LoginService {

    static final int MAX_FAILURES_BEFORE_LOCK = 5;

    private static final Logger log = LoggerFactory.getLogger(LoginService.class);

    record Account(UUID id, String email, String language) {}

    private record StoredUser(UUID id, String email, String passwordHash, String language, boolean locked) {}

    private final JdbcClient jdbc;
    private final PasswordHashing passwordHashing;
    /** Checked against when the email is unknown, so every attempt does the same work (no timing leak). */
    private final String dummyHash;

    LoginService(JdbcClient jdbc, PasswordHashing passwordHashing, PasswordEncoder passwordEncoder) {
        this.jdbc = jdbc;
        this.passwordHashing = passwordHashing;
        this.dummyHash = passwordEncoder.encode("timing-equaliser-" + Tokens.generate());
    }

    /** Empty for every kind of failure (unknown email, wrong password, locked), so callers can't tell them apart. */
    @Transactional
    Optional<Account> authenticate(String rawEmail, String rawPassword) {
        String email = EmailAddresses.normalize(rawEmail);
        String password = PasswordPolicy.normalize(rawPassword);

        Optional<StoredUser> found = jdbc.sql("""
                        SELECT id, email, password_hash, preferred_language,
                               (locked_until IS NOT NULL AND locked_until > now()) AS locked
                        FROM users WHERE email = :email
                        FOR UPDATE
                        """)
                .param("email", email)
                .query((rs, rowNum) -> new StoredUser(
                        rs.getObject("id", UUID.class),
                        rs.getString("email"),
                        rs.getString("password_hash"),
                        rs.getString("preferred_language"),
                        rs.getBoolean("locked")))
                .optional();

        if (found.isEmpty()) {
            passwordHashing.matches(password, dummyHash);
            return Optional.empty();
        }
        StoredUser user = found.get();
        // Always check the password, even when locked, so a locked account looks and times the same
        boolean correct = passwordHashing.matches(password, user.passwordHash());

        if (user.locked()) {
            log.info("Sign-in attempt on a locked account {}", user.id());
            return Optional.empty();
        }
        if (!correct) {
            recordWrongPassword(user.id());
            log.info("Failed sign-in for account {}", user.id());
            return Optional.empty();
        }

        // With two-step verification on, the count is only cleared once the second step succeeds; otherwise
        // signing in again with the password would allow unlimited guesses at the code
        jdbc.sql("""
                        UPDATE users SET failed_logins = 0, locked_until = NULL
                        WHERE id = :id
                          AND NOT EXISTS (SELECT 1 FROM totp_credentials
                                          WHERE user_id = :id AND confirmed_at IS NOT NULL)
                        """)
                .param("id", user.id())
                .update();
        return Optional.of(new Account(user.id(), user.email(), user.language()));
    }

    /**
     * Counts a wrong password towards the temporary lock (5 in a row = 15 minutes). Shared by sign-in and
     * change-password, so a stolen session can't be used to guess the password without limit.
     */
    void recordWrongPassword(UUID id) {
        jdbc.sql("""
                        UPDATE users
                        SET failed_logins = failed_logins + 1,
                            locked_until = CASE WHEN failed_logins + 1 >= :max
                                                THEN now() + interval '15 minutes'
                                                ELSE locked_until END,
                            updated_at = now()
                        WHERE id = :id
                        """)
                .param("max", MAX_FAILURES_BEFORE_LOCK)
                .param("id", id)
                .update();
    }

    void clearFailures(UUID id) {
        jdbc.sql("UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = :id")
                .param("id", id)
                .update();
    }

    boolean isLocked(UUID id) {
        return jdbc.sql("SELECT locked_until IS NOT NULL AND locked_until > now() FROM users WHERE id = :id")
                .param("id", id)
                .query(Boolean.class)
                .optional()
                .orElse(true);
    }

    /**
     * Re-checks the password of a signed-in account before a sensitive change. Throws a field error "incorrect"
     * if it's wrong or the account is locked; wrong guesses count towards the lock. Callers' transactions must
     * not roll back on {@link FieldValidationException}, or the count would be lost.
     */
    void requirePassword(UUID id, String rawPassword, String field) {
        String hash = jdbc.sql("SELECT password_hash FROM users WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query(String.class)
                .optional()
                .orElseThrow(() -> new FieldValidationException(field, "incorrect"));
        boolean correct = rawPassword != null && passwordHashing.matches(PasswordPolicy.normalize(rawPassword), hash);
        if (!correct) {
            recordWrongPassword(id);
            log.info("Wrong password re-entered for account {}", id);
        }
        if (!correct || isLocked(id)) {
            throw new FieldValidationException(field, "incorrect");
        }
    }

    /** Ends every session of the account on the server, except the one given. */
    int endOtherSessions(UUID id, String keepSessionId) {
        return jdbc.sql("DELETE FROM spring_session WHERE principal_name = :name AND session_id <> :keep")
                .param("name", id.toString())
                .param("keep", keepSessionId)
                .update();
    }

    Optional<Account> findAccount(UUID id) {
        return jdbc.sql("SELECT id, email, preferred_language FROM users WHERE id = :id")
                .param("id", id)
                .query((rs, rowNum) -> new Account(
                        rs.getObject("id", UUID.class), rs.getString("email"), rs.getString("preferred_language")))
                .optional();
    }
}
