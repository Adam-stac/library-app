-- Changing the account's email address: a one-hour link is sent to the new address, and the change happens only
-- when it is opened, which proves the person controls that address. Only a SHA-256 of the emailed token is stored.
CREATE TABLE email_changes (
    id         uuid PRIMARY KEY,
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    new_email  text        NOT NULL CHECK (char_length(new_email) <= 254),
    token_hash text        NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_changes_user_created_idx ON email_changes (user_id, created_at);
