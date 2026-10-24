package io.github.adamstac.libraryapp.users;

import io.github.adamstac.libraryapp.FieldValidationException;
import io.github.adamstac.libraryapp.InvalidRequestException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.List;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Two-step verification: an authenticator app (TOTP) plus one-time recovery codes. Never SMS. */
@Service
class TwoFactorService {

    static final String ISSUER = "My Library";

    private static final Logger log = LoggerFactory.getLogger(TwoFactorService.class);
    private static final SecureRandom RANDOM = new SecureRandom();

    public record Status(boolean enabled, int recoveryCodesLeft) {}

    public record Setup(String secret, String otpauthUri) {}

    private record Owner(String email, String language) {}

    private record Credential(byte[] secretEncrypted, long lastUsedStep) {}

    private final JdbcClient jdbc;
    private final SecretBox secretBox;
    private final LoginService logins;
    private final MailDispatcher mail;
    private final String baseUrl;
    private final Clock clock;
    private final SecurityEvents events;

    @Autowired
    TwoFactorService(
            JdbcClient jdbc,
            SecretBox secretBox,
            LoginService logins,
            MailDispatcher mail,
            SecurityEvents events,
            @Value("${app.base-url}") String baseUrl) {
        this(jdbc, secretBox, logins, mail, events, baseUrl, Clock.systemUTC());
    }

    TwoFactorService(
            JdbcClient jdbc,
            SecretBox secretBox,
            LoginService logins,
            MailDispatcher mail,
            SecurityEvents events,
            String baseUrl,
            Clock clock) {
        this.events = events;
        this.jdbc = jdbc;
        this.secretBox = secretBox;
        this.logins = logins;
        this.mail = mail;
        this.baseUrl = baseUrl;
        this.clock = clock;
    }

    boolean isEnabled(UUID userId) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM totp_credentials WHERE user_id = :id AND confirmed_at IS NOT NULL)")
                .param("id", userId)
                .query(Boolean.class)
                .single();
    }

    Status status(UUID userId) {
        int left = jdbc.sql("SELECT count(*) FROM recovery_codes WHERE user_id = :id AND used_at IS NULL")
                .param("id", userId)
                .query(Integer.class)
                .single();
        return new Status(isEnabled(userId), left);
    }

    /** Step 1 of turning it on: needs the password; creates a secret for the person to add to their app. */
    @Transactional(noRollbackFor = FieldValidationException.class)
    Setup startSetup(UUID userId, String currentPassword) {
        logins.requirePassword(userId, currentPassword, "currentPassword");
        if (isEnabled(userId)) {
            throw new InvalidRequestException("already_enabled");
        }
        byte[] secret = new byte[Totp.SECRET_BYTES];
        RANDOM.nextBytes(secret);
        jdbc.sql("""
                        INSERT INTO totp_credentials (user_id, secret_encrypted)
                        VALUES (:id, :secret)
                        ON CONFLICT (user_id) DO UPDATE
                            SET secret_encrypted = EXCLUDED.secret_encrypted, last_used_step = 0, created_at = now()
                            WHERE totp_credentials.confirmed_at IS NULL
                        """)
                .param("id", userId)
                .param("secret", secretBox.encrypt(secret, userId.toString()))
                .update();

        String encoded = Base32.encode(secret);
        String email = owner(userId).email();
        String label = URLEncoder.encode(ISSUER + ":" + email, StandardCharsets.UTF_8).replace("+", "%20");
        String issuer = URLEncoder.encode(ISSUER, StandardCharsets.UTF_8).replace("+", "%20");
        return new Setup(encoded, "otpauth://totp/" + label + "?secret=" + encoded + "&issuer=" + issuer
                + "&algorithm=SHA1&digits=6&period=30");
    }

    /**
     * Step 2: proves the app is set up by checking a code from it. Turns two-step verification on, returns
     * new recovery codes (shown once), ends every other session and emails the owner.
     */
    @Transactional
    List<String> confirmSetup(UUID userId, String currentSessionId, String code) {
        Credential pending = jdbc.sql("""
                        SELECT secret_encrypted, last_used_step FROM totp_credentials
                        WHERE user_id = :id AND confirmed_at IS NULL
                        FOR UPDATE
                        """)
                .param("id", userId)
                .query((rs, rowNum) -> new Credential(rs.getBytes("secret_encrypted"), rs.getLong("last_used_step")))
                .optional()
                .orElseThrow(() -> new InvalidRequestException("setup_not_started"));

        byte[] secret = secretBox.decrypt(pending.secretEncrypted(), userId.toString());
        OptionalLong step = Totp.verify(secret, Totp.normalizeDigits(code), nowStep(), pending.lastUsedStep());
        if (step.isEmpty()) {
            throw new FieldValidationException("code", "invalid_code");
        }
        jdbc.sql("UPDATE totp_credentials SET confirmed_at = now(), last_used_step = :step WHERE user_id = :id")
                .param("step", step.getAsLong())
                .param("id", userId)
                .update();
        List<String> codes = replaceRecoveryCodes(userId);
        int ended = logins.endOtherSessions(userId, currentSessionId);
        log.info("Two-step verification turned on for account {}; {} other session(s) ended", userId, ended);
        events.record(userId, SecurityEvents.TWO_FACTOR_ON);
        Owner owner = owner(userId);
        mail.sendAfterCommit(owner.email(), AccountEmails.twoFactorTurnedOn(owner.language(), forgotPasswordLink()));
        return codes;
    }

    /** Turning it off needs the password and a current code (or a recovery code). */
    @Transactional(noRollbackFor = FieldValidationException.class)
    void disable(UUID userId, String currentSessionId, String currentPassword, String code) {
        logins.requirePassword(userId, currentPassword, "currentPassword");
        if (!isEnabled(userId)) {
            throw new InvalidRequestException("not_enabled");
        }
        if (!checkCode(userId, code)) {
            logins.recordWrongPassword(userId);
            throw new FieldValidationException("code", "invalid_code");
        }
        jdbc.sql("DELETE FROM totp_credentials WHERE user_id = :id").param("id", userId).update();
        jdbc.sql("DELETE FROM recovery_codes WHERE user_id = :id").param("id", userId).update();
        int ended = logins.endOtherSessions(userId, currentSessionId);
        log.info("Two-step verification turned off for account {}; {} other session(s) ended", userId, ended);
        events.record(userId, SecurityEvents.TWO_FACTOR_OFF);
        Owner owner = owner(userId);
        mail.sendAfterCommit(owner.email(), AccountEmails.twoFactorTurnedOff(owner.language(), forgotPasswordLink()));
    }

    /** New recovery codes; the old ones stop working. Needs the password. */
    @Transactional(noRollbackFor = FieldValidationException.class)
    List<String> newRecoveryCodes(UUID userId, String currentPassword) {
        logins.requirePassword(userId, currentPassword, "currentPassword");
        if (!isEnabled(userId)) {
            throw new InvalidRequestException("not_enabled");
        }
        List<String> codes = replaceRecoveryCodes(userId);
        log.info("New recovery codes created for account {}", userId);
        events.record(userId, SecurityEvents.RECOVERY_CODES_NEW);
        Owner owner = owner(userId);
        mail.sendAfterCommit(owner.email(), AccountEmails.newRecoveryCodes(owner.language(), forgotPasswordLink()));
        return codes;
    }

    /**
     * The second step of signing in. Accepts a code from the app or a recovery code (each works once).
     * Wrong codes count towards the same lock as wrong passwords; a locked account always fails.
     */
    @Transactional
    boolean verifySignIn(UUID userId, String code) {
        // One check at a time per account, so parallel guesses can't slip past the lock
        jdbc.sql("SELECT id FROM users WHERE id = :id FOR UPDATE")
                .param("id", userId)
                .query((rs, rowNum) -> rs.getObject("id", UUID.class))
                .optional();
        if (logins.isLocked(userId)) {
            log.info("Second step attempted on a locked account {}", userId);
            return false;
        }
        if (!checkCode(userId, code)) {
            logins.recordWrongPassword(userId);
            log.info("Wrong second-step code for account {}", userId);
            events.record(userId, SecurityEvents.SECOND_STEP_FAILED);
            return false;
        }
        logins.clearFailures(userId);
        return true;
    }

    /** True if the code is a valid app code (newer than the last one used) or an unused recovery code; uses it up. */
    private boolean checkCode(UUID userId, String code) {
        String digits = Totp.normalizeDigits(code);
        if (digits.matches("\\d{6}")) {
            Optional<Credential> credential = jdbc.sql("""
                            SELECT secret_encrypted, last_used_step FROM totp_credentials
                            WHERE user_id = :id AND confirmed_at IS NOT NULL
                            FOR UPDATE
                            """)
                    .param("id", userId)
                    .query((rs, rowNum) -> new Credential(rs.getBytes("secret_encrypted"), rs.getLong("last_used_step")))
                    .optional();
            if (credential.isEmpty()) {
                return false;
            }
            byte[] secret = secretBox.decrypt(credential.get().secretEncrypted(), userId.toString());
            OptionalLong step = Totp.verify(secret, digits, nowStep(), credential.get().lastUsedStep());
            if (step.isEmpty()) {
                return false;
            }
            jdbc.sql("UPDATE totp_credentials SET last_used_step = :step WHERE user_id = :id")
                    .param("step", step.getAsLong())
                    .param("id", userId)
                    .update();
            return true;
        }

        Optional<String> recoveryCode = RecoveryCodes.normalize(code);
        if (recoveryCode.isEmpty()) {
            return false;
        }
        int used = jdbc.sql("""
                        UPDATE recovery_codes SET used_at = now()
                        WHERE user_id = :id AND code_hash = :hash AND used_at IS NULL
                        """)
                .param("id", userId)
                .param("hash", RecoveryCodes.hash(recoveryCode.get()))
                .update();
        if (used == 0) {
            return false;
        }
        int left = status(userId).recoveryCodesLeft();
        log.info("Recovery code used for account {}; {} left", userId, left);
        events.record(userId, SecurityEvents.RECOVERY_CODE_USED, left + " left");
        Owner owner = owner(userId);
        mail.sendAfterCommit(owner.email(), AccountEmails.recoveryCodeUsed(owner.language(), left, forgotPasswordLink()));
        return true;
    }

    private List<String> replaceRecoveryCodes(UUID userId) {
        jdbc.sql("DELETE FROM recovery_codes WHERE user_id = :id").param("id", userId).update();
        List<String> codes = RecoveryCodes.generate();
        for (String code : codes) {
            jdbc.sql("INSERT INTO recovery_codes (id, user_id, code_hash) VALUES (:id, :userId, :hash)")
                    .param("id", UUID.randomUUID())
                    .param("userId", userId)
                    .param("hash", RecoveryCodes.hash(RecoveryCodes.normalize(code).orElseThrow()))
                    .update();
        }
        return codes;
    }

    private Owner owner(UUID userId) {
        return jdbc.sql("SELECT email, preferred_language FROM users WHERE id = :id")
                .param("id", userId)
                .query((rs, rowNum) -> new Owner(rs.getString("email"), rs.getString("preferred_language")))
                .single();
    }

    private long nowStep() {
        return Totp.stepAt(clock.instant());
    }

    private String forgotPasswordLink() {
        return baseUrl + "/forgot-password";
    }
}
