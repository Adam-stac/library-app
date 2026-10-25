-- Sciences (ADR 0007). Each account has its own list, which it can rename, delete and add to. A new account
-- starts with the starter list below, copied in by a trigger on users, so every account gets it however it is
-- created. Every limit here is also checked by the API, so these CHECKs are a second line of defence.

-- The starter list: read-only, never changed through the API
CREATE TABLE starter_sciences (
    position integer PRIMARY KEY,
    name_ar  text    NOT NULL CHECK (char_length(name_ar) BETWEEN 1 AND 100),
    name_en  text    NOT NULL CHECK (char_length(name_en) BETWEEN 1 AND 100)
);

INSERT INTO starter_sciences (position, name_ar, name_en) VALUES
    (1, 'العقيدة', 'ʿAqīdah'),
    (2, 'التفسير', 'Tafsīr'),
    (3, 'علوم القرآن', 'Qurʾānic sciences'),
    (4, 'التجويد والقراءات', 'Tajwīd and Qirāʾāt'),
    (5, 'الحديث', 'Ḥadīth'),
    (6, 'مصطلح الحديث', 'Muṣṭalaḥ al-Ḥadīth'),
    (7, 'الفقه', 'Fiqh'),
    (8, 'أصول الفقه', 'Uṣūl al-Fiqh'),
    (9, 'السيرة النبوية', 'Sīrah'),
    (10, 'التاريخ والتراجم', 'History and biographies'),
    (11, 'اللغة العربية', 'Arabic language'),
    (12, 'الآداب والرقائق', 'Manners and heart-softeners'),
    (13, 'الأدب والشعر', 'Literature and poetry');

CREATE TABLE sciences (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id   uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name_ar    text        CHECK (char_length(name_ar) BETWEEN 1 AND 100),
    name_en    text        CHECK (char_length(name_en) BETWEEN 1 AND 100),
    version    integer     NOT NULL DEFAULT 0, -- each edit adds 1; an edit based on an older one is refused
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT sciences_name_given CHECK (name_ar IS NOT NULL OR name_en IS NOT NULL)
);

CREATE INDEX sciences_owner_idx ON sciences (owner_id);
-- One account can't have two sciences with the same name (the English name ignoring case)
CREATE UNIQUE INDEX sciences_owner_name_ar_key ON sciences (owner_id, name_ar) WHERE name_ar IS NOT NULL;
CREATE UNIQUE INDEX sciences_owner_name_en_key ON sciences (owner_id, lower(name_en)) WHERE name_en IS NOT NULL;

-- Gives a new account its own copy of the starter list
CREATE FUNCTION give_starter_sciences() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO sciences (owner_id, name_ar, name_en)
    SELECT NEW.id, name_ar, name_en FROM starter_sciences ORDER BY position;
    RETURN NULL;
END;
$$;

CREATE TRIGGER users_starter_sciences
    AFTER INSERT ON users
    FOR EACH ROW EXECUTE FUNCTION give_starter_sciences();

-- Accounts that already exist get the starter list too
INSERT INTO sciences (owner_id, name_ar, name_en)
SELECT users.id, starter_sciences.name_ar, starter_sciences.name_en
FROM users CROSS JOIN starter_sciences
ORDER BY users.id, starter_sciences.position;
