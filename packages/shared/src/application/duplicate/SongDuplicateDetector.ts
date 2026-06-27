import type { DatabaseConnection } from '../../data/database/DatabaseConnection.js';
import type { DuplicateCheckResult } from '../../domain/interfaces/CategoryDefinition.js';
import { SongRepository } from '../../data/repositories/SongRepository.js';
import { SongArtistRepository } from '../../data/repositories/SongArtistRepository.js';

/** Resolution options for Scenario A (exact duplicate) */
const SCENARIO_A_OPTIONS = ['Overwrite Existing', 'Skip Creation'] as const;

/** Resolution options for Scenario B (partial overlap) */
const SCENARIO_B_OPTIONS = ['Merge Artists onto Existing Song', 'Create Separate Entry'] as const;

/**
 * Detect potential duplicate songs before creation.
 *
 * Implements the normalization pipeline from Constitution §14.4:
 * 1. Unicode NFC normalization
 * 2. Lowercase
 * 3. Trim leading/trailing whitespace
 * 4. Collapse internal whitespace sequences to single space
 *
 * Classification:
 * - Scenario A (exact): same normalized name + same artist ID set
 * - Scenario B (partial): same normalized name + different/overlapping artist set
 */
export class SongDuplicateDetector {
  private readonly songRepo: SongRepository;
  private readonly songArtistRepo: SongArtistRepository;

  constructor(db: DatabaseConnection) {
    this.songRepo = new SongRepository(db);
    this.songArtistRepo = new SongArtistRepository(db);
  }

  /**
   * Normalize a song name using the 4-step pipeline.
   * Returns empty string for empty input.
   */
  private static normalize(name: string): string {
    return name
      .normalize('NFC')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
  }

  /**
   * Check a candidate song for potential duplicates against existing songs.
   *
   * @param candidate - The song name and artist IDs to check
   * @param candidate.name - The song name to normalize and compare
   * @param candidate.artistIds - UUID strings of the candidate's artists
   * @returns Array of duplicate check results (empty if no matches)
   */
  async checkForDuplicates(candidate: {
    name: string;
    artistIds: string[];
  }): Promise<DuplicateCheckResult[]> {
    // DUP-01/DUP-17: Empty name → return immediately, no DB calls
    if (!candidate.name) {
      return [];
    }

    const normalizedCandidate = SongDuplicateDetector.normalize(candidate.name);
    const candidateArtistSet = new Set(candidate.artistIds);

    // Get all active songs
    const songs = await this.songRepo.findAll();

    const results: DuplicateCheckResult[] = [];

    for (const song of songs) {
      // Normalize stored song name for comparison
      const normalizedStored = SongDuplicateDetector.normalize(song.name);

      // Skip if names don't match after normalization
      if (normalizedStored !== normalizedCandidate) {
        continue;
      }

      // Name matches — now compare artist sets
      const songArtists = await this.songArtistRepo.findBySongId(song.id);
      const storedArtistIds = songArtists.map((sa) => sa.artist_id);
      const storedArtistSet = new Set(storedArtistIds);

      // Check if artist sets are identical
      const isExactMatch =
        candidateArtistSet.size === storedArtistSet.size &&
        [...candidateArtistSet].every((id) => storedArtistSet.has(id));

      if (isExactMatch) {
        // Scenario A: exact duplicate
        results.push({
          type: 'exact',
          existingItem: song,
          resolutionOptions: [...SCENARIO_A_OPTIONS],
        });
      } else {
        // Scenario B: partial overlap
        results.push({
          type: 'partial',
          existingItem: song,
          resolutionOptions: [...SCENARIO_B_OPTIONS],
        });
      }
    }

    return results;
  }
}
