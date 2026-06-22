-- Migration 001: Core Infrastructure Tables
-- Creates: app_metadata, devices, sync_log, app_settings, languages, categories
-- Seeded with ~60 languages and the 'songs' category entry

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_metadata (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
    id            TEXT PRIMARY KEY NOT NULL,
    name          TEXT NOT NULL,
    platform      TEXT NOT NULL CHECK (platform IN ('ANDROID', 'WINDOWS')),
    registered_at TEXT NOT NULL,
    last_seen_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_log (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id        TEXT NOT NULL REFERENCES devices(id),
    started_at       TEXT NOT NULL,
    completed_at     TEXT,
    direction        TEXT,
    status           TEXT,
    records_affected INTEGER,
    error_message    TEXT
);

CREATE TABLE IF NOT EXISTS app_settings (
    key        TEXT PRIMARY KEY NOT NULL,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS languages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    iso_code   TEXT UNIQUE NOT NULL,
    name       TEXT NOT NULL,
    native_name TEXT NOT NULL,
    user_added INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
    id                     TEXT PRIMARY KEY NOT NULL,
    display_name           TEXT NOT NULL,
    icon_name              TEXT NOT NULL,
    enabled                INTEGER NOT NULL DEFAULT 1,
    sort_order             INTEGER NOT NULL,
    introduced_in_version  TEXT NOT NULL
);

INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('schema_version', '0');

INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('af', 'Afrikaans', 'Afrikaans', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('ar', 'Arabic', 'العربية', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('az', 'Azerbaijani', 'Azərbaycan dili', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('be', 'Belarusian', 'Беларуская', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('bg', 'Bulgarian', 'Български', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('bn', 'Bengali', 'বাংলা', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('ca', 'Catalan', 'Català', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('cs', 'Czech', 'Čeština', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('cy', 'Welsh', 'Cymraeg', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('da', 'Danish', 'Dansk', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('de', 'German', 'Deutsch', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('el', 'Greek', 'Ελληνικά', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('en', 'English', 'English', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('eo', 'Esperanto', 'Esperanto', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('es', 'Spanish', 'Español', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('et', 'Estonian', 'Eesti', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('eu', 'Basque', 'Euskara', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('fa', 'Persian', 'فارسی', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('fi', 'Finnish', 'Suomi', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('fr', 'French', 'Français', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('ga', 'Irish', 'Gaeilge', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('gl', 'Galician', 'Galego', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('gu', 'Gujarati', 'ગુજરાતી', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('he', 'Hebrew', 'עברית', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('hi', 'Hindi', 'हिन्दी', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('hr', 'Croatian', 'Hrvatski', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('hu', 'Hungarian', 'Magyar', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('hy', 'Armenian', 'Հայերեն', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('id', 'Indonesian', 'Bahasa Indonesia', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('is', 'Icelandic', 'Íslenska', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('it', 'Italian', 'Italiano', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('ja', 'Japanese', '日本語', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('ka', 'Georgian', 'ქართული', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('kk', 'Kazakh', 'Қазақ тілі', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('kn', 'Kannada', 'ಕನ್ನಡ', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('ko', 'Korean', '한국어', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('lt', 'Lithuanian', 'Lietuvių', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('lv', 'Latvian', 'Latviešu', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('mk', 'Macedonian', 'Македонски', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('ml', 'Malayalam', 'മലയാളം', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('mn', 'Mongolian', 'Монгол', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('mr', 'Marathi', 'मराठी', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('ms', 'Malay', 'Bahasa Melayu', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('mt', 'Maltese', 'Malti', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('nl', 'Dutch', 'Nederlands', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('no', 'Norwegian', 'Norsk', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('pa', 'Punjabi', 'ਪੰਜਾਬੀ', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('pl', 'Polish', 'Polski', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('pt', 'Portuguese', 'Português', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('ro', 'Romanian', 'Română', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('ru', 'Russian', 'Русский', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('sk', 'Slovak', 'Slovenčina', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('sl', 'Slovenian', 'Slovenščina', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('sq', 'Albanian', 'Shqip', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('sr', 'Serbian', 'Српски', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('sv', 'Swedish', 'Svenska', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('sw', 'Swahili', 'Kiswahili', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('ta', 'Tamil', 'தமிழ்', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('te', 'Telugu', 'తెలుగు', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('th', 'Thai', 'ไทย', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('tl', 'Tagalog', 'Tagalog', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('tr', 'Turkish', 'Türkçe', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('uk', 'Ukrainian', 'Українська', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('ur', 'Urdu', 'اردو', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('uz', 'Uzbek', 'Oʻzbek', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('vi', 'Vietnamese', 'Tiếng Việt', 0, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO languages (iso_code, name, native_name, user_added, created_at) VALUES ('zh', 'Chinese', '中文', 0, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO categories (id, display_name, icon_name, enabled, sort_order, introduced_in_version) VALUES ('songs', 'Songs', 'music-note', 1, 1, '1.0.0');
