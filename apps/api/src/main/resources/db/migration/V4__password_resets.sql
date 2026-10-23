-- One-time password-reset links. Only a SHA-256 of the emailed token is stored.
CREATE TABLE password_resets (
    id         uuid PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX password_resets_user_created_idx ON password_resets (user_id, created_at);
