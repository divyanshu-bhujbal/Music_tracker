-- Migration 002: Songs Category Tables
-- Creates: artists, songs, song_artists

CREATE TABLE IF NOT EXISTS artists (
    id           TEXT PRIMARY KEY NOT NULL,
    display_name TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT
);

CREATE TABLE IF NOT EXISTS songs (
    id          TEXT PRIMARY KEY NOT NULL,
    name        TEXT NOT NULL,
    album_name  TEXT,
    language_id INTEGER NOT NULL REFERENCES languages(id),
    added_at    TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
);

CREATE TABLE IF NOT EXISTS song_artists (
    song_id    TEXT NOT NULL REFERENCES songs(id),
    artist_id  TEXT NOT NULL REFERENCES artists(id),
    sort_order INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (song_id, artist_id)
);
