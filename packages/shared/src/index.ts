export type { DatabaseConnection } from './data/database/DatabaseConnection.js';
export { DatabaseError, ConstraintError, ConnectionError } from './data/database/DatabaseError.js';
export { MigrationRunner } from './data/database/MigrationRunner.js';
export type {
  Migration,
  MigrationResult,
  MigrationReport,
  MigrationStatus,
} from './data/database/MigrationTypes.js';
export { DatabaseIntegrityCheck } from './data/database/DatabaseIntegrityCheck.js';
export type { IntegrityReport } from './data/database/DatabaseIntegrityCheck.js';
export type { AppMetadataKey } from './domain/models/AppMetadataKey.js';
export { APP_METADATA_KEYS } from './domain/models/AppMetadataKey.js';
export { AppMetadataRepository } from './data/repositories/AppMetadataRepository.js';
export type { Device, Platform } from './domain/models/Device.js';
export { DeviceRepository } from './data/repositories/DeviceRepository.js';
export type { Language } from './domain/models/Language.js';
export { LanguageRepository } from './data/repositories/LanguageRepository.js';
export type { Category } from './domain/models/Category.js';
export { CategoryRepository } from './data/repositories/CategoryRepository.js';
export type {
  SyncLog,
  SyncDirection,
  SyncStatus,
  CreateSyncLogInput,
} from './domain/models/SyncLog.js';
export { SyncLogRepository } from './data/repositories/SyncLogRepository.js';
export type { AppSettingsKey } from './domain/models/AppSettingsKey.js';
export { APP_SETTINGS_KEYS } from './domain/models/AppSettingsKey.js';
export { AppSettingsRepository } from './data/repositories/AppSettingsRepository.js';
export type { Artist } from './domain/models/Artist.js';
export { ArtistRepository } from './data/repositories/ArtistRepository.js';
export type {
  Song,
  CreateSongInput,
  UpdateSongInput,
  SongWithArtists,
  SongArtistWithName,
} from './domain/models/Song.js';
export { SongRepository } from './data/repositories/SongRepository.js';
export type { SongArtist } from './domain/models/SongArtist.js';
export { SongArtistRepository } from './data/repositories/SongArtistRepository.js';
export type { CryptoProvider } from './domain/interfaces/CryptoProvider.js';
export type { AuthProvider, AuthTokens, OAuthConfig } from './domain/interfaces/AuthProvider.js';
export type { SecureStorageProvider } from './domain/interfaces/SecureStorageProvider.js';
export type {
  CloudStorageProvider,
  UploadResult,
  DownloadResult,
  DriveFileInfo,
} from './domain/interfaces/CloudStorageProvider.js';
export type { NetworkMonitorInterface } from './domain/interfaces/NetworkMonitorInterface.js';
export type { EncryptedData } from './domain/types/EncryptedData.js';
export { AuthenticationError } from './domain/errors/AuthenticationError.js';
export { AuthCancelledError } from './domain/errors/AuthCancelledError.js';
export { AuthNetworkError } from './domain/errors/AuthNetworkError.js';
export { CloudStorageError } from './domain/errors/CloudStorageError.js';
export type { CloudStorageErrorCode } from './domain/errors/CloudStorageError.js';
export { FormatError } from './domain/errors/FormatError.js';
export { VersionError } from './domain/errors/VersionError.js';
export { EncryptedFileFormat } from './data/database/EncryptedFileFormat.js';
export type { ServiceProvider } from './application/ServiceProvider.js';
export type {
  CategoryDefinition,
  ColumnDefinition,
  FilterDefinition,
  DuplicateCheckResult,
  RepositoryMap,
} from './domain/interfaces/CategoryDefinition.js';
export { CategoryRegistry } from './application/category/CategoryRegistry.js';
export { useActiveCategory, useActiveCategoryStore } from './application/category/useActiveCategory.js';
export { useCategoryList } from './application/category/useCategoryList.js';
export { useCategorySearchFields } from './application/category/useCategorySearchFields.js';
export { SongDuplicateDetector } from './application/duplicate/SongDuplicateDetector.js';
export { FilterEngine } from './application/search/FilterEngine.js';
export type { FilterResult } from './application/search/FilterEngine.js';
export { SortEngine } from './application/search/SortEngine.js';
export type { SortResult } from './application/search/SortEngine.js';
export { DirtyStateTracker } from './application/sync/DirtyStateTracker.js';
export { SyncTimer } from './application/sync/SyncTimer.js';
export { SyncLock } from './application/sync/SyncLock.js';
export { SyncEngine } from './application/sync/SyncEngine.js';
export type { SyncResult, SyncEngineState } from './application/sync/SyncEngine.js';
export { useSyncStore } from './application/sync/useSyncStore.js';
export type { SyncState, SyncStoreState } from './application/sync/useSyncStore.js';
export { ChangeTracker } from './application/sync/ChangeTracker.js';
export { ConflictResolver } from './application/sync/ConflictResolver.js';
export type { MergeResult, OrphanReport } from './application/sync/ConflictResolver.js';
export { RecoveryManager } from './application/sync/RecoveryManager.js';
export type { RecoveryResult, RecoveryStatus, RecoveryManagerParams } from './application/sync/RecoveryManager.js';
