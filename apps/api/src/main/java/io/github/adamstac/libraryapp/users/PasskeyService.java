package io.github.adamstac.libraryapp.users;

import com.webauthn4j.WebAuthnManager;
import com.webauthn4j.converter.AttestedCredentialDataConverter;
import com.webauthn4j.converter.util.ObjectConverter;
import com.webauthn4j.credential.CredentialRecordImpl;
import com.webauthn4j.data.AuthenticationData;
import com.webauthn4j.data.AuthenticationParameters;
import com.webauthn4j.data.AuthenticatorTransport;
import com.webauthn4j.data.PublicKeyCredentialParameters;
import com.webauthn4j.data.PublicKeyCredentialType;
import com.webauthn4j.data.RegistrationData;
import com.webauthn4j.data.RegistrationParameters;
import com.webauthn4j.data.attestation.authenticator.AttestedCredentialData;
import com.webauthn4j.data.attestation.authenticator.AuthenticatorData;
import com.webauthn4j.data.attestation.statement.COSEAlgorithmIdentifier;
import com.webauthn4j.data.client.Origin;
import com.webauthn4j.data.client.challenge.DefaultChallenge;
import com.webauthn4j.server.ServerProperty;
import io.github.adamstac.libraryapp.FieldValidationException;
import io.github.adamstac.libraryapp.InvalidRequestException;
import java.net.URI;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Passkeys (WebAuthn): sign in with the device's fingerprint, face or PIN instead of a password.
 * The browser only ever releases a passkey to this site's own address, so passkeys can't be phished.
 * All cryptographic checks are done by webauthn4j; this class supplies the challenge, the expected origin
 * and site ID, and the stored public key, and records the result.
 */
@Service
class PasskeyService {

    static final int MAX_PASSKEYS = 10;
    static final long TIMEOUT_MILLIS = 300_000;
    private static final String SITE_NAME = "My Library";

    private static final Logger log = LoggerFactory.getLogger(PasskeyService.class);
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder B64URL = Base64.getUrlEncoder().withoutPadding();

    /** Algorithms we accept, strongest first: EdDSA, ES256 (most authenticators) and RS256 (Windows Hello). */
    private static final List<PublicKeyCredentialParameters> ALGORITHMS = List.of(
            new PublicKeyCredentialParameters(PublicKeyCredentialType.PUBLIC_KEY, COSEAlgorithmIdentifier.EdDSA),
            new PublicKeyCredentialParameters(PublicKeyCredentialType.PUBLIC_KEY, COSEAlgorithmIdentifier.ES256),
            new PublicKeyCredentialParameters(PublicKeyCredentialType.PUBLIC_KEY, COSEAlgorithmIdentifier.RS256));

    public record Passkey(UUID id, String label, OffsetDateTime createdAt, OffsetDateTime lastUsedAt) {}

    /** What the browser needs to start, and the one-time challenge to keep in the session until it answers. */
    record Ceremony(Map<String, Object> options, byte[] challenge) {}

    private record Owner(String email, String language, byte[] userHandle) {}

    private record StoredPasskey(
            UUID id, UUID userId, byte[] userHandle, byte[] attestedCredentialData, long signCount,
            boolean backupEligible, boolean backedUp, String transports, boolean locked) {}

    private final JdbcClient jdbc;
    private final LoginService logins;
    private final MailDispatcher mail;
    private final String baseUrl;
    private final Origin origin;
    private final String rpId;
    private final ObjectConverter objectConverter = new ObjectConverter();
    private final AttestedCredentialDataConverter credentialDataConverter = new AttestedCredentialDataConverter(objectConverter);
    private final WebAuthnManager webAuthn = WebAuthnManager.createNonStrictWebAuthnManager(objectConverter);

    PasskeyService(JdbcClient jdbc, LoginService logins, MailDispatcher mail, @Value("${app.base-url}") String baseUrl) {
        this.jdbc = jdbc;
        this.logins = logins;
        this.mail = mail;
        this.baseUrl = baseUrl;
        // The site's own address: passkeys are bound to it, and answers from any other origin are rejected
        URI site = URI.create(baseUrl);
        this.origin = new Origin(site.getScheme() + "://" + site.getAuthority());
        this.rpId = site.getHost();
    }

    List<Passkey> list(UUID userId) {
        return jdbc.sql("""
                        SELECT id, label, created_at, last_used_at FROM passkeys
                        WHERE user_id = :id ORDER BY created_at
                        """)
                .param("id", userId)
                .query((rs, rowNum) -> new Passkey(
                        rs.getObject("id", UUID.class),
                        rs.getString("label"),
                        rs.getObject("created_at", OffsetDateTime.class),
                        rs.getObject("last_used_at", OffsetDateTime.class)))
                .list();
    }

    // ---- Adding a passkey ---------------------------------------------------------------------------------

    /** Step 1: needs the password again; returns options for the browser's "create a passkey" prompt. */
    @Transactional(noRollbackFor = FieldValidationException.class)
    Ceremony startRegistration(UUID userId, String currentPassword) {
        logins.requirePassword(userId, currentPassword, "currentPassword");
        if (list(userId).size() >= MAX_PASSKEYS) {
            throw new InvalidRequestException("too_many_passkeys");
        }
        Owner owner = owner(userId);
        byte[] challenge = randomBytes(32);

        Map<String, Object> options = new LinkedHashMap<>();
        options.put("rp", Map.of("id", rpId, "name", SITE_NAME));
        options.put("user", Map.of(
                "id", B64URL.encodeToString(owner.userHandle()), "name", owner.email(), "displayName", owner.email()));
        options.put("challenge", B64URL.encodeToString(challenge));
        options.put("pubKeyCredParams", ALGORITHMS.stream()
                .map(p -> Map.of("type", "public-key", "alg", p.getAlg().getValue()))
                .toList());
        options.put("timeout", TIMEOUT_MILLIS);
        // Stops the same authenticator being registered twice
        options.put("excludeCredentials", credentialIdsOf(userId).stream()
                .map(id -> Map.of("type", "public-key", "id", B64URL.encodeToString(id)))
                .toList());
        // A passkey must be discoverable (sign in without typing an email) and must check fingerprint, face or PIN
        options.put("authenticatorSelection", Map.of(
                "residentKey", "required", "requireResidentKey", true, "userVerification", "required"));
        options.put("attestation", "none");
        return new Ceremony(options, challenge);
    }

    /** Step 2: checks the browser's answer against the challenge from step 1 and stores the public key. */
    @Transactional
    Passkey finishRegistration(UUID userId, byte[] challenge, Map<String, Object> credential, String label) {
        RegistrationData data;
        try {
            data = webAuthn.parseRegistrationResponseJSON(objectConverter.getJsonMapper().writeValueAsString(credential));
            webAuthn.verify(data, new RegistrationParameters(serverProperty(challenge), ALGORITHMS, true, true));
        } catch (RuntimeException e) { // malformed JSON, missing fields or a failed check: all mean "not valid"
            log.info("Passkey registration rejected for account {} ({})", userId, e.getClass().getSimpleName());
            throw new InvalidRequestException("invalid_passkey");
        }
        AuthenticatorData<?> authenticatorData = data.getAttestationObject().getAuthenticatorData();
        AttestedCredentialData credentialData = authenticatorData.getAttestedCredentialData();
        Set<AuthenticatorTransport> transports = data.getTransports();
        UUID id = UUID.randomUUID();
        int added = jdbc.sql("""
                        INSERT INTO passkeys (id, user_id, credential_id, attested_credential_data, sign_count,
                                              backup_eligible, backed_up, transports, label)
                        VALUES (:id, :userId, :credentialId, :data, :signCount, :be, :bs, :transports, :label)
                        ON CONFLICT (credential_id) DO NOTHING
                        """)
                .param("id", id)
                .param("userId", userId)
                .param("credentialId", credentialData.getCredentialId())
                .param("data", credentialDataConverter.convert(credentialData))
                .param("signCount", authenticatorData.getSignCount())
                .param("be", authenticatorData.isFlagBE())
                .param("bs", authenticatorData.isFlagBS())
                .param("transports", transports == null ? "" : transports.stream()
                        .map(AuthenticatorTransport::getValue).collect(Collectors.joining(",")))
                .param("label", label)
                .update();
        if (added == 0) {
            throw new InvalidRequestException("passkey_already_registered");
        }
        log.info("Passkey added to account {}", userId);
        Owner owner = owner(userId);
        mail.sendAfterCommit(owner.email(), AccountEmails.passkeyAdded(owner.language(), label, forgotPasswordLink()));
        return list(userId).stream().filter(p -> p.id().equals(id)).findFirst().orElseThrow();
    }

    /** Removing a passkey needs the password again. */
    @Transactional(noRollbackFor = FieldValidationException.class)
    void remove(UUID userId, UUID passkeyId, String currentPassword) {
        logins.requirePassword(userId, currentPassword, "currentPassword");
        String label = jdbc.sql("DELETE FROM passkeys WHERE id = :id AND user_id = :userId RETURNING label")
                .param("id", passkeyId)
                .param("userId", userId)
                .query(String.class)
                .optional()
                .orElseThrow(() -> new InvalidRequestException("not_found"));
        log.info("Passkey removed from account {}", userId);
        Owner owner = owner(userId);
        mail.sendAfterCommit(owner.email(), AccountEmails.passkeyRemoved(owner.language(), label, forgotPasswordLink()));
    }

    // ---- Signing in with a passkey ------------------------------------------------------------------------

    /** Options for the browser's "sign in with a passkey" prompt. Any of the person's passkeys may answer. */
    Ceremony startSignIn() {
        byte[] challenge = randomBytes(32);
        Map<String, Object> options = new LinkedHashMap<>();
        options.put("challenge", B64URL.encodeToString(challenge));
        options.put("timeout", TIMEOUT_MILLIS);
        options.put("rpId", rpId);
        options.put("userVerification", "required");
        options.put("allowCredentials", List.of());
        return new Ceremony(options, challenge);
    }

    /**
     * Checks the browser's answer: the right site, the challenge from this session, the stored public key,
     * fingerprint/face/PIN performed, and a signature counter that hasn't gone backwards (a sign of a cloned key).
     * Empty for every kind of failure.
     */
    @Transactional
    Optional<LoginService.Account> finishSignIn(byte[] challenge, Map<String, Object> credential) {
        AuthenticationData data;
        try {
            data = webAuthn.parseAuthenticationResponseJSON(objectConverter.getJsonMapper().writeValueAsString(credential));
        } catch (RuntimeException e) {
            log.info("Unreadable passkey sign-in ({})", e.getClass().getSimpleName());
            return Optional.empty();
        }
        Optional<StoredPasskey> found = jdbc.sql("""
                        SELECT p.id, p.user_id, u.webauthn_user_handle, p.attested_credential_data, p.sign_count,
                               p.backup_eligible, p.backed_up, p.transports,
                               (u.locked_until IS NOT NULL AND u.locked_until > now()) AS locked
                        FROM passkeys p JOIN users u ON u.id = p.user_id
                        WHERE p.credential_id = :credentialId
                        FOR UPDATE OF p
                        """)
                .param("credentialId", data.getCredentialId())
                .query((rs, rowNum) -> new StoredPasskey(
                        rs.getObject("id", UUID.class),
                        rs.getObject("user_id", UUID.class),
                        rs.getBytes("webauthn_user_handle"),
                        rs.getBytes("attested_credential_data"),
                        rs.getLong("sign_count"),
                        rs.getBoolean("backup_eligible"),
                        rs.getBoolean("backed_up"),
                        rs.getString("transports"),
                        rs.getBoolean("locked")))
                .optional();
        if (found.isEmpty()) {
            log.info("Passkey sign-in with an unknown passkey");
            return Optional.empty();
        }
        StoredPasskey passkey = found.get();
        // The authenticator says which account the passkey belongs to; it must agree with our records
        if (data.getUserHandle() != null && !Arrays.equals(data.getUserHandle(), passkey.userHandle())) {
            log.warn("Passkey sign-in with a mismatched user handle for account {}", passkey.userId());
            return Optional.empty();
        }
        if (passkey.locked()) {
            log.info("Passkey sign-in attempt on a locked account {}", passkey.userId());
            return Optional.empty();
        }

        CredentialRecordImpl credentialRecord = new CredentialRecordImpl(
                null, true, passkey.backupEligible(), passkey.backedUp(), passkey.signCount(),
                credentialDataConverter.convert(passkey.attestedCredentialData()),
                null, null, null, transportsOf(passkey.transports()));
        try {
            webAuthn.verify(data, new AuthenticationParameters(serverProperty(challenge), credentialRecord, null, true, true));
        } catch (RuntimeException e) { // bad signature, wrong site or challenge, no fingerprint/face/PIN, cloned key
            log.warn("Passkey sign-in rejected for account {} ({})", passkey.userId(), e.getClass().getSimpleName());
            return Optional.empty();
        }

        AuthenticatorData<?> authenticatorData = data.getAuthenticatorData();
        jdbc.sql("""
                        UPDATE passkeys SET sign_count = :signCount, backed_up = :bs, last_used_at = now()
                        WHERE id = :id
                        """)
                .param("signCount", authenticatorData.getSignCount())
                .param("bs", authenticatorData.isFlagBS())
                .param("id", passkey.id())
                .update();
        log.info("Signed in with a passkey to account {}", passkey.userId());
        return logins.findAccount(passkey.userId());
    }

    // ---- Helpers ------------------------------------------------------------------------------------------

    private ServerProperty serverProperty(byte[] challenge) {
        return ServerProperty.builder().origin(origin).rpId(rpId).challenge(new DefaultChallenge(challenge)).build();
    }

    /** Every account gets a random user handle the first time it adds a passkey; it never changes. */
    private Owner owner(UUID userId) {
        jdbc.sql("UPDATE users SET webauthn_user_handle = :handle WHERE id = :id AND webauthn_user_handle IS NULL")
                .param("handle", randomBytes(32))
                .param("id", userId)
                .update();
        return jdbc.sql("SELECT email, preferred_language, webauthn_user_handle FROM users WHERE id = :id")
                .param("id", userId)
                .query((rs, rowNum) -> new Owner(
                        rs.getString("email"), rs.getString("preferred_language"), rs.getBytes("webauthn_user_handle")))
                .single();
    }

    private List<byte[]> credentialIdsOf(UUID userId) {
        return jdbc.sql("SELECT credential_id FROM passkeys WHERE user_id = :id")
                .param("id", userId)
                .query((rs, rowNum) -> rs.getBytes("credential_id"))
                .list();
    }

    private static Set<AuthenticatorTransport> transportsOf(String stored) {
        if (stored == null || stored.isBlank()) {
            return Set.of();
        }
        return Arrays.stream(stored.split(",")).map(AuthenticatorTransport::create).collect(Collectors.toSet());
    }

    private static byte[] randomBytes(int length) {
        byte[] bytes = new byte[length];
        RANDOM.nextBytes(bytes);
        return bytes;
    }

    private String forgotPasswordLink() {
        return baseUrl + "/forgot-password";
    }
}
