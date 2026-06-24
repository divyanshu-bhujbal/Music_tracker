export interface Song {
  id: string;
  name: string;
  album_name: string | null;
  language_id: number;
  added_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateSongInput {
  name: string;
  album_name: string | null;
  language_id: number;
}

export interface UpdateSongInput {
  name: string;
  album_name: string | null;
  language_id: number;
}

export interface SongArtistWithName {
  id: string;
  display_name: string;
  sort_order: number;
}

export interface SongWithArtists extends Song {
  artists: SongArtistWithName[];
}
