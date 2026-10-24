-- Authenticator-app (TOTP) two-step verification. The shared secret is encrypted with AES-256-GCM using a key
-- that lives outside the database (TOTP_ENCRYPTION_KEY), so a database leak alone doesn't reveal it.
CREATE TABLE totp_credentials (
    user_id          uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    secret_encrypted bytea       NOT NULL, -- 12-byte nonce followed by the ciphertext and tag
    confirmed_at     timestamptz,          -- NULL while being set up
    last_used_step   bigint      NOT NULL DEFAULT 0, -- each code works once (replay protection)
    created_at       timestamptz NOT NULL DEFAULT now()
);

-- One-time recovery codes for when the authenticator app is lost. Only a SHA-256 of each 80-bit code is stored.
CREATE TABLE recovery_codes (
    id         uuid PRIMARY KEY,
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    code_hash  text        NOT NULL,
    used_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, code_hash)
);
