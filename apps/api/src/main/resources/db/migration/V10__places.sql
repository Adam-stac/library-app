-- Places (ADR 0006): a shared starter list that nobody can change through the API (owner_id is NULL), and the
-- places each user adds for themselves (deleted with their account). Authors can now name a birthplace and a
-- death place. Every limit here is also checked by the API, so these CHECKs are a second line of defence.

-- True when every alternative name is present and 1 to 200 characters long
CREATE FUNCTION place_other_names_valid(names text[]) RETURNS boolean
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    RETURN coalesce((SELECT bool_and(n IS NOT NULL AND char_length(n) BETWEEN 1 AND 200) FROM unnest(names) AS n), true);

CREATE TABLE places (
    id          uuid         PRIMARY KEY,
    owner_id    uuid         REFERENCES users (id) ON DELETE CASCADE, -- NULL: on the shared starter list
    name_ar     text         CHECK (char_length(name_ar) BETWEEN 1 AND 200),
    name_en     text         CHECK (char_length(name_en) BETWEEN 1 AND 200),
    other_names text[]       NOT NULL DEFAULT '{}'
                             CHECK (cardinality(other_names) <= 10 AND place_other_names_valid(other_names)),
    country_ar  text         CHECK (char_length(country_ar) BETWEEN 1 AND 100), -- the modern country
    country_en  text         CHECK (char_length(country_en) BETWEEN 1 AND 100),
    latitude    numeric(7,5) CHECK (latitude BETWEEN -90 AND 90),
    longitude   numeric(8,5) CHECK (longitude BETWEEN -180 AND 180),
    version     integer      NOT NULL DEFAULT 0, -- each edit adds 1; an edit based on an older one is refused
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT places_name_given CHECK (name_ar IS NOT NULL OR name_en IS NOT NULL),
    CONSTRAINT places_coordinates_together CHECK ((latitude IS NULL) = (longitude IS NULL))
);

CREATE INDEX places_owner_idx ON places (owner_id);

-- An author's places must be the author owner's own places or shared ones; the API checks that. A place that is
-- still in use can't be deleted (the API answers 409 in_use; this foreign key is the second line of defence).
ALTER TABLE authors
    ADD COLUMN birth_place_id uuid REFERENCES places (id),
    ADD COLUMN death_place_id uuid REFERENCES places (id);

CREATE INDEX authors_birth_place_idx ON authors (birth_place_id) WHERE birth_place_id IS NOT NULL;
CREATE INDEX authors_death_place_idx ON authors (death_place_id) WHERE death_place_id IS NOT NULL;

-- The shared starter list: the classical name first, the modern name among the other names. Coordinates are
-- approximate (two decimal places, about a kilometre), for a map view later. The IDs never change.
INSERT INTO places (id, name_ar, name_en, other_names, country_ar, country_en, latitude, longitude) VALUES
    ('54025e8a-3a27-5ece-bf7a-9c4d3f31f01b', 'مكة', 'Makkah', ARRAY['مكة المكرمة', 'بكة', 'Mecca']::text[], 'السعودية', 'Saudi Arabia', 21.42, 39.83),
    ('06396cad-713b-58ac-bfe8-2ac97b9117ca', 'المدينة', 'Madinah', ARRAY['المدينة المنورة', 'يثرب', 'Medina', 'Yathrib']::text[], 'السعودية', 'Saudi Arabia', 24.47, 39.61),
    ('dcf7e5bb-1434-57ad-94c8-9d61f932fe9d', 'الطائف', 'Taif', '{}', 'السعودية', 'Saudi Arabia', 21.27, 40.42),
    ('09298f1a-1c62-5b7f-8d73-cf23e6a604ec', 'صنعاء', 'Sanaa', ARRAY['Sana''a']::text[], 'اليمن', 'Yemen', 15.35, 44.21),
    ('83bb8749-721c-5e69-825a-d46d11df7ba1', 'زبيد', 'Zabid', '{}', 'اليمن', 'Yemen', 14.20, 43.32),
    ('ac8eaea0-3ef8-5436-a061-693aa1fe3d7f', 'بغداد', 'Baghdad', ARRAY['مدينة السلام', 'Madinat al-Salam']::text[], 'العراق', 'Iraq', 33.31, 44.36),
    ('de68436d-d3ad-5946-b00d-d1e58456db1d', 'الكوفة', 'Kufa', ARRAY['al-Kufa']::text[], 'العراق', 'Iraq', 32.03, 44.40),
    ('b8df6557-7a61-58bc-98a3-d4300e498401', 'البصرة', 'Basra', ARRAY['al-Basra']::text[], 'العراق', 'Iraq', 30.51, 47.81),
    ('9503576a-3981-5c1e-839c-bb7eedaabc59', 'واسط', 'Wasit', '{}', 'العراق', 'Iraq', 32.19, 46.30),
    ('6d6251ad-a68c-5616-b6e0-b27ea0568a3d', 'الموصل', 'Mosul', ARRAY['al-Mawsil']::text[], 'العراق', 'Iraq', 36.34, 43.13),
    ('c5ef1760-f8ab-5a43-8ab3-67cdf8ee383d', 'سامراء', 'Samarra', ARRAY['سر من رأى']::text[], 'العراق', 'Iraq', 34.20, 43.87),
    ('9b616211-b4cf-524f-a7ef-ef7e47a716f6', 'دمشق', 'Damascus', ARRAY['الشام', 'Dimashq']::text[], 'سوريا', 'Syria', 33.51, 36.29),
    ('3afc6395-1173-5de1-982c-0fc188295cdf', 'حلب', 'Aleppo', ARRAY['Halab']::text[], 'سوريا', 'Syria', 36.20, 37.16),
    ('8e21c718-fc3e-5963-9e26-8265d4b87d54', 'حمص', 'Homs', ARRAY['Hims']::text[], 'سوريا', 'Syria', 34.73, 36.71),
    ('b244d08b-bc81-50aa-987a-3b00f3f5f9f8', 'حماة', 'Hama', '{}', 'سوريا', 'Syria', 35.13, 36.75),
    ('d787da50-8d24-59ed-aa0d-45fe522068e0', 'نوى', 'Nawa', '{}', 'سوريا', 'Syria', 32.89, 36.04),
    ('5d821c73-74c9-597f-9617-ffcb88d1dbe3', 'القدس', 'Jerusalem', ARRAY['بيت المقدس', 'إيلياء', 'al-Quds', 'Bayt al-Maqdis']::text[], 'فلسطين', 'Palestine', 31.78, 35.23),
    ('39b6f62d-96ba-52be-b346-e139cc655d32', 'غزة', 'Gaza', ARRAY['Ghazza']::text[], 'فلسطين', 'Palestine', 31.50, 34.47),
    ('bcdb453c-3fca-5570-8e65-1170e15e0b66', 'الخليل', 'Hebron', ARRAY['al-Khalil']::text[], 'فلسطين', 'Palestine', 31.53, 35.10),
    ('f3a41c46-8118-55a9-a279-27e7a4e4ba7c', 'نابلس', 'Nablus', '{}', 'فلسطين', 'Palestine', 32.22, 35.26),
    ('d864e50f-84f0-52ff-80b6-0c431dc8063f', 'بيروت', 'Beirut', '{}', 'لبنان', 'Lebanon', 33.89, 35.50),
    ('7a2eb042-896d-59bc-a46d-d0960026bcfa', 'بعلبك', 'Baalbek', '{}', 'لبنان', 'Lebanon', 34.01, 36.21),
    ('35081093-3103-50ce-90e6-27f2c53ae57d', 'طرابلس الشام', 'Tripoli (Levant)', ARRAY['Tarabulus al-Sham']::text[], 'لبنان', 'Lebanon', 34.44, 35.83),
    ('71cebf28-454d-5b66-a747-49d927ffac93', 'حران', 'Harran', '{}', 'تركيا', 'Turkey', 36.86, 39.03),
    ('6e649799-02df-5997-b529-049536d5e426', 'القسطنطينية', 'Constantinople', ARRAY['إسطنبول', 'الأستانة', 'Istanbul']::text[], 'تركيا', 'Turkey', 41.01, 28.98),
    ('4a36e4ad-8461-5e91-88b2-64f327060d85', 'الفسطاط', 'Fustat', ARRAY['مصر القديمة', 'Old Cairo']::text[], 'مصر', 'Egypt', 30.01, 31.23),
    ('441f2fe1-8d03-5deb-a98a-7504b9dd72a3', 'القاهرة', 'Cairo', ARRAY['al-Qahira']::text[], 'مصر', 'Egypt', 30.04, 31.24),
    ('9044142a-fe3a-500a-b08c-aa9131b66077', 'الإسكندرية', 'Alexandria', ARRAY['al-Iskandariyya']::text[], 'مصر', 'Egypt', 31.20, 29.92),
    ('2baf04a5-25f4-57ef-b53c-7130419edd97', 'القيروان', 'Kairouan', ARRAY['al-Qayrawan']::text[], 'تونس', 'Tunisia', 35.68, 10.10),
    ('959cba04-2e6e-5763-a61f-d5111e76cf47', 'تونس', 'Tunis', '{}', 'تونس', 'Tunisia', 36.81, 10.18),
    ('6484cc5e-5cff-5c68-8ce9-a51fdb29289c', 'تلمسان', 'Tlemcen', ARRAY['Tilimsan']::text[], 'الجزائر', 'Algeria', 34.88, -1.32),
    ('8972c36d-cbfa-5d73-8ca7-c0366d14aaf0', 'فاس', 'Fez', ARRAY['Fas']::text[], 'المغرب', 'Morocco', 34.03, -5.00),
    ('3c5d142d-3c11-5ab5-83d6-3804267e6fe0', 'مراكش', 'Marrakesh', ARRAY['Marrakush']::text[], 'المغرب', 'Morocco', 31.63, -7.99),
    ('e79e3741-a773-537c-8939-f5b68d5ec72e', 'شنقيط', 'Chinguetti', ARRAY['Shinqit']::text[], 'موريتانيا', 'Mauritania', 20.46, -12.36),
    ('8f05dabe-a5ba-5e54-9ace-a73836ccda01', 'تمبكتو', 'Timbuktu', ARRAY['Tinbuktu']::text[], 'مالي', 'Mali', 16.77, -3.01),
    ('9d5679d2-2352-5ab1-b768-6c7145925cfc', 'قرطبة', 'Cordoba', ARRAY['Qurtuba']::text[], 'إسبانيا', 'Spain', 37.88, -4.78),
    ('b2de7c1d-7030-5fa1-a574-4b102836ffd6', 'إشبيلية', 'Seville', ARRAY['Ishbiliya']::text[], 'إسبانيا', 'Spain', 37.39, -5.98),
    ('bc6e6c61-2b97-5474-9698-411bc878d54c', 'غرناطة', 'Granada', ARRAY['Gharnata']::text[], 'إسبانيا', 'Spain', 37.18, -3.60),
    ('0ec152b6-eb88-5dae-b9a6-5e7ae2e5bbac', 'طليطلة', 'Toledo', ARRAY['Tulaytula']::text[], 'إسبانيا', 'Spain', 39.86, -4.03),
    ('bc939d29-6cd6-51da-9e8c-fa247bb70299', 'الري', 'Rayy', ARRAY['Ray']::text[], 'إيران', 'Iran', 35.59, 51.44),
    ('5fc00848-3574-5570-b17a-f15981c65d19', 'قزوين', 'Qazvin', ARRAY['Qazwin']::text[], 'إيران', 'Iran', 36.27, 50.00),
    ('6d2e8ede-b913-5e8d-b216-d2953e4d98d9', 'أصبهان', 'Isfahan', ARRAY['أصفهان', 'Isbahan']::text[], 'إيران', 'Iran', 32.65, 51.67),
    ('b3eaa100-5af0-5a8f-996a-77004072e6b7', 'شيراز', 'Shiraz', '{}', 'إيران', 'Iran', 29.59, 52.58),
    ('4c08d8f3-03ca-5dee-8b41-09a2758e4cf6', 'نيسابور', 'Nishapur', ARRAY['نيشابور', 'Naysabur']::text[], 'إيران', 'Iran', 36.21, 58.80),
    ('31bd672c-80f0-5e1d-b961-e83b622ac290', 'طوس', 'Tus', '{}', 'إيران', 'Iran', 36.48, 59.51),
    ('d10b391b-229a-5cd8-ba3d-e6cb1d8e93c4', 'مرو', 'Merv', ARRAY['Marw']::text[], 'تركمانستان', 'Turkmenistan', 37.66, 62.19),
    ('821dc13f-2e6e-5755-aa14-ee8fd6f40a34', 'نسا', 'Nasa', ARRAY['Nisa']::text[], 'تركمانستان', 'Turkmenistan', 37.95, 58.21),
    ('ff6e0f53-7ff9-5f90-9bcb-248d8441b004', 'بخارى', 'Bukhara', '{}', 'أوزبكستان', 'Uzbekistan', 39.77, 64.42),
    ('62d4646a-f3ee-5a4f-8326-717b3f81ba36', 'سمرقند', 'Samarkand', ARRAY['Samarqand']::text[], 'أوزبكستان', 'Uzbekistan', 39.65, 66.96),
    ('6ba10f09-8bb9-5d73-8447-46cabbdfd07a', 'ترمذ', 'Termez', ARRAY['Tirmidh']::text[], 'أوزبكستان', 'Uzbekistan', 37.22, 67.28),
    ('6cf8306e-e560-5576-b0d9-4bfff6c737ea', 'بلخ', 'Balkh', '{}', 'أفغانستان', 'Afghanistan', 36.76, 66.90),
    ('8a3f58bf-ba78-597a-9e39-bc035cdc1543', 'هراة', 'Herat', ARRAY['Harat']::text[], 'أفغانستان', 'Afghanistan', 34.35, 62.20),
    ('64c46488-3b60-53c5-8cde-1d6964115573', 'دهلي', 'Delhi', ARRAY['دلهي', 'Dihli']::text[], 'الهند', 'India', 28.65, 77.23);
