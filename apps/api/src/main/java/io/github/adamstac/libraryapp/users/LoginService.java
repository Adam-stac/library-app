package io.github.adamstac.libraryapp.users;

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
                    .param("id", user.id())
                    .update();
            log.info("Failed sign-in for account {}", user.id());
            return Optional.empty();
        }

        jdbc.sql("UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = :id")
                .param("id", user.id())
                .update();
        return Optional.of(new Account(user.id(), user.email(), user.language()));
    }

    Optional<Account> findAccount(UUID id) {
        return jdbc.sql("SELECT id, email, preferred_language FROM users WHERE id = :id")
                .param("id", id)
                .query((rs, rowNum) -> new Account(
                        rs.getObject("id", UUID.class), rs.getString("email"), rs.getString("preferred_language")))
                .optional();
    }
}
