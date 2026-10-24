package io.github.adamstac.libraryapp.users;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Arrays;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A software passkey for tests. It holds a real P-256 key pair and answers the server's challenges exactly as a
 * phone or security key would: the same CBOR, the same signed data, the same JSON the browser sends. Its public
 * fields let a test make it misbehave (wrong website, no fingerprint check, counter rolled back, bad signature).
 */
class TestAuthenticator {

    private static final Base64.Encoder B64URL = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64URL_DECODE = Base64.getUrlDecoder();
    private static final SecureRandom RANDOM = new SecureRandom();

    String origin = "http://localhost:3000";
    String rpId = "localhost";
    boolean userVerified = true;
    boolean tamperSignature = false;
    long counter = 0;

    final byte[] credentialId = new byte[16];
    private final boolean edDsa;
    private final KeyPair keys;
    private byte[] userHandle;

    /** An ES256 (P-256) passkey, the most common kind. */
    TestAuthenticator() {
        this(false);
    }

    /** @param edDsa true for an EdDSA (Ed25519) passkey, which Chrome and others choose when offered */
    TestAuthenticator(boolean edDsa) {
        this.edDsa = edDsa;
        RANDOM.nextBytes(credentialId);
        try {
            if (edDsa) {
                keys = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
            } else {
                KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
                generator.initialize(new ECGenParameterSpec("secp256r1"));
                keys = generator.generateKeyPair();
            }
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Answers the "create a passkey" prompt (navigator.credentials.create). */
    @SuppressWarnings("unchecked")
    Map<String, Object> create(Map<String, Object> options) {
        userHandle = B64URL_DECODE.decode((String) ((Map<String, Object>) options.get("user")).get("id"));
        byte[] clientData = clientData("webauthn.create", (String) options.get("challenge"));

        ByteArrayOutputStream authData = new ByteArrayOutputStream();
        authData.writeBytes(sha256(rpId.getBytes(StandardCharsets.UTF_8)));
        authData.write(flags() | 0x40); // attested credential data included
        authData.writeBytes(ByteBuffer.allocate(4).putInt((int) counter).array());
        authData.writeBytes(new byte[16]); // authenticator model ID (AAGUID): none
        authData.writeBytes(ByteBuffer.allocate(2).putShort((short) credentialId.length).array());
        authData.writeBytes(credentialId);
        authData.writeBytes(coseKey());

        Cbor attestationObject = new Cbor().map(3)
                .text("fmt").text("none")
                .text("attStmt").map(0)
                .text("authData").bytes(authData.toByteArray());

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("clientDataJSON", B64URL.encodeToString(clientData));
        response.put("attestationObject", B64URL.encodeToString(attestationObject.toBytes()));
        response.put("transports", List.of("internal"));
        return credential(response);
    }

    /** Answers the "sign in with a passkey" prompt (navigator.credentials.get). */
    Map<String, Object> get(Map<String, Object> options) {
        counter++;
        byte[] clientData = clientData("webauthn.get", (String) options.get("challenge"));
        ByteArrayOutputStream authData = new ByteArrayOutputStream();
        authData.writeBytes(sha256(rpId.getBytes(StandardCharsets.UTF_8)));
        authData.write(flags());
        authData.writeBytes(ByteBuffer.allocate(4).putInt((int) counter).array());
        byte[] authenticatorData = authData.toByteArray();

        byte[] signature;
        try {
            Signature signer = Signature.getInstance(edDsa ? "Ed25519" : "SHA256withECDSA");
            signer.initSign(keys.getPrivate());
            signer.update(authenticatorData);
            signer.update(sha256(clientData));
            signature = signer.sign();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
        if (tamperSignature) {
            signature[signature.length - 1] ^= 1;
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("clientDataJSON", B64URL.encodeToString(clientData));
        response.put("authenticatorData", B64URL.encodeToString(authenticatorData));
        response.put("signature", B64URL.encodeToString(signature));
        response.put("userHandle", B64URL.encodeToString(userHandle));
        return credential(response);
    }

    private int flags() {
        return 0x01 | (userVerified ? 0x04 : 0); // user present, and user verified (fingerprint, face or PIN)
    }

    private Map<String, Object> credential(Map<String, Object> response) {
        Map<String, Object> credential = new LinkedHashMap<>();
        credential.put("id", B64URL.encodeToString(credentialId));
        credential.put("rawId", B64URL.encodeToString(credentialId));
        credential.put("type", "public-key");
        credential.put("response", response);
        credential.put("clientExtensionResults", Map.of());
        credential.put("authenticatorAttachment", "platform");
        return credential;
    }

    private byte[] clientData(String type, String challenge) {
        return ("{\"type\":\"" + type + "\",\"challenge\":\"" + challenge + "\",\"origin\":\"" + origin
                        + "\",\"crossOrigin\":false}")
                .getBytes(StandardCharsets.UTF_8);
    }

    /** COSE encoding of the public key (OKP for Ed25519, or EC2 for P-256 with x and y). */
    private byte[] coseKey() {
        if (edDsa) {
            byte[] encoded = keys.getPublic().getEncoded(); // X.509: a fixed 12-byte header, then the 32-byte key
            byte[] x = Arrays.copyOfRange(encoded, encoded.length - 32, encoded.length);
            return new Cbor().map(4)
                    .integer(1).integer(1)
                    .integer(3).integer(-8)
                    .integer(-1).integer(6)
                    .integer(-2).bytes(x)
                    .toBytes();
        }
        ECPublicKey key = (ECPublicKey) keys.getPublic();
        return new Cbor().map(5)
                .integer(1).integer(2)
                .integer(3).integer(-7)
                .integer(-1).integer(1)
                .integer(-2).bytes(unsigned32(key.getW().getAffineX()))
                .integer(-3).bytes(unsigned32(key.getW().getAffineY()))
                .toBytes();
    }

    private static byte[] unsigned32(BigInteger value) {
        byte[] raw = value.toByteArray();
        byte[] out = new byte[32];
        int copy = Math.min(raw.length, 32);
        System.arraycopy(raw, raw.length - copy, out, 32 - copy, copy);
        return out;
    }

    private static byte[] sha256(byte[] data) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(data);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Just enough CBOR (RFC 8949) for attestation objects and COSE keys. */
    private static final class Cbor {
        private final ByteArrayOutputStream out = new ByteArrayOutputStream();

        Cbor map(int entries) { head(5, entries); return this; }

        Cbor text(String value) {
            byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
            head(3, bytes.length);
            out.writeBytes(bytes);
            return this;
        }

        Cbor bytes(byte[] value) {
            head(2, value.length);
            out.writeBytes(value);
            return this;
        }

        Cbor integer(long value) {
            if (value >= 0) head(0, value); else head(1, -1 - value);
            return this;
        }

        byte[] toBytes() { return out.toByteArray(); }

        private void head(int major, long value) {
            if (value < 24) {
                out.write((major << 5) | (int) value);
            } else if (value < 256) {
                out.write((major << 5) | 24);
                out.write((int) value);
            } else if (value < 65536) {
                out.write((major << 5) | 25);
                out.writeBytes(ByteBuffer.allocate(2).putShort((short) value).array());
            } else {
                out.write((major << 5) | 26);
                out.writeBytes(ByteBuffer.allocate(4).putInt((int) value).array());
            }
        }
    }
}
