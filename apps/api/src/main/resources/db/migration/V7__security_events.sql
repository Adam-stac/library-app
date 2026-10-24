-- What happened to each account and from where, for the owner's "security activity" page and for investigations.
-- Kept for 90 days (data minimisation), then deleted by an hourly job.
CREATE TABLE security_events (
    id          uuid PRIMARY KEY,
    user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type        text        NOT NULL CHECK (char_length(type) <= 40),
    detail      text        CHECK (char_length(detail) <= 100),
    device      text        CHECK (char_length(device) <= 60), -- e.g. "Chrome on Windows", never the raw user agent
    ip          text        CHECK (char_length(ip) <= 45),
    occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX security_events_user_time_idx ON security_events (user_id, occurred_at DESC);
