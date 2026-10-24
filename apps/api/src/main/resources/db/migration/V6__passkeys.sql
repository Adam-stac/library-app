-- Passkeys (WebAuthn). The server stores only public keys: nothing here can be used to sign in.
-- The user handle identifies the account to authenticators without revealing its email address or ID.
ALTER TABLE users ADD COLUMN webauthn_user_handle bytea UNIQUE;

CREATE TABLE passkeys (
    id                       uuid PRIMARY KEY,
    user_id                  uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    credential_id            bytea       NOT NULL UNIQUE,
    attested_credential_data bytea       NOT NULL, -- authenticator model ID, credential ID and public key
    sign_count               bigint      NOT NULL DEFAULT 0, -- a counter going backwards suggests a cloned key
    backup_eligible          boolean     NOT NULL,
    backed_up                boolean     NOT NULL,
    transports               text        NOT NULL DEFAULT '',
    label                    text        NOT NULL CHECK (char_length(label) BETWEEN 1 AND 64),
    created_at               timestamptz NOT NULL DEFAULT now(),
    last_used_at             timestamptz
);

CREATE INDEX passkeys_user_idx ON passkeys (user_id);
