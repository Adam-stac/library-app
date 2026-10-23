-- Verified accounts only: a row exists here only after the email address has been proven.
CREATE TABLE users (
    id                 uuid PRIMARY KEY,
    email              text NOT NULL UNIQUE CHECK (char_length(email) <= 254),
    password_hash      text NOT NULL,
    preferred_language text NOT NULL CHECK (preferred_language IN ('ar', 'en')),
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Registrations waiting for email verification. Each attempt keeps its own password hash,
-- so whoever verifies gets the password they chose (prevents pre-account takeover).
CREATE TABLE pending_registrations (
    id                 uuid PRIMARY KEY,
    email              text NOT NULL CHECK (char_length(email) <= 254),
    password_hash      text NOT NULL,
    preferred_language text NOT NULL CHECK (preferred_language IN ('ar', 'en')),
    token_hash         text NOT NULL UNIQUE, -- SHA-256 of the emailed token; the token itself is never stored
    expires_at         timestamptz NOT NULL,
    created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pending_registrations_email_created_idx ON pending_registrations (email, created_at);
