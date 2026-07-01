/**
 * Application-layer settings orchestrator.
 *
 * Wraps `AppSettingsRepository` with typed get/set, defaults, validation,
 * and type coercion. The single source of truth for all settings access
 * above the data layer.
 *
 * Source: E14 Implementation Specification §6.1
 */

import type { AppSettingsKey } from '../../domain/models/AppSettingsKey.js';
import { AppSettingsRepository } from '../../data/repositories/AppSettingsRepository.js';
import { SETTINGS_DEFAULTS, SETTINGS_SCHEMA } from './settings-defaults.js';

export interface SettingsValues {
  theme: 'light' | 'dark';
  default_view: 'table' | 'tile';
  sync_on_startup: boolean;
  auto_sync_delay_seconds: number;
  trash_retention_days: number;
}

const BOOLEAN_KEYS: readonly AppSettingsKey[] = ['sync_on_startup'];
const NUMBER_KEYS: readonly AppSettingsKey[] = ['auto_sync_delay_seconds', 'trash_retention_days'];

export class SettingsManager {
  private readonly repository: AppSettingsRepository;

  constructor(repository: AppSettingsRepository) {
    this.repository = repository;
  }

  /**
   * Returns the typed value for a setting.
   * If the key is not stored, returns the default.
   * Performs type coercion for boolean and number keys.
   */
  async get(key: AppSettingsKey): Promise<string | number | boolean> {
    const raw = await this.repository.get(key);
    const defaultStr = SETTINGS_DEFAULTS[key];
    const schema = SETTINGS_SCHEMA[key];

    if (raw === null) {
      console.debug(`SettingsManager: get('${key}') = '${defaultStr}' (stored: null, using default)`);
      return this.coerce(defaultStr, key);
    }

    if (BOOLEAN_KEYS.includes(key)) {
      const coerced = raw === 'true';
      console.debug(`SettingsManager: get('${key}') = ${coerced} (stored: '${raw}')`);
      return coerced;
    }

    if (NUMBER_KEYS.includes(key)) {
      const num = Number(raw);
      if (Number.isNaN(num)) {
        console.warn(`SettingsManager: corrupt value for '${key}': '${raw}' — using default`);
        return this.coerce(defaultStr, key);
      }
      // Validate range if schema defines min/max
      if (schema.min !== undefined && schema.max !== undefined) {
        if (num < schema.min || num > schema.max) {
          console.warn(`SettingsManager: out-of-range value for '${key}': ${num} — using default`);
          return this.coerce(defaultStr, key);
        }
      }
      console.debug(`SettingsManager: get('${key}') = ${num} (stored: '${raw}')`);
      return num;
    }

    // String keys (theme, default_view)
    console.debug(`SettingsManager: get('${key}') = '${raw}' (stored: '${raw}')`);
    return raw;
  }

  /**
   * Validates and persists a setting value.
   * Throws on invalid input.
   */
  async set(key: AppSettingsKey, value: unknown): Promise<void> {
    this.validate(key, value);
    console.debug(`SettingsManager: set('${key}', '${String(value)}')`);
    await this.repository.set(key, String(value));
  }

  /**
   * Returns all settings as a typed object.
   * Missing keys get default values.
   */
  async getAll(): Promise<SettingsValues> {
    const stored = await this.repository.getAll();
    const keys = Object.keys(SETTINGS_DEFAULTS) as AppSettingsKey[];
    let defaultsUsed = 0;

    const result: Record<string, string | number | boolean> = {};
    for (const key of keys) {
      const raw = stored[key];
      if (raw === undefined || raw === null) {
        result[key] = this.coerce(SETTINGS_DEFAULTS[key], key);
        defaultsUsed++;
      } else {
        result[key] = this.coerce(raw, key);
      }
    }

    console.debug(`SettingsManager: getAll() — ${keys.length - defaultsUsed} keys stored, ${defaultsUsed} defaults`);
    return result as unknown as SettingsValues;
  }

  /**
   * Overwrites all 5 keys to their defaults in a single transaction.
   */
  async resetAll(): Promise<void> {
    console.info('SettingsManager: resetAll() — restored 5 default values');
    const keys = Object.keys(SETTINGS_DEFAULTS) as AppSettingsKey[];
    await this.repository.setMultiple(
      keys.map((key) => ({ key, value: SETTINGS_DEFAULTS[key] })),
    );
  }

  /**
   * Returns the default value for a key. Synchronous — no database call.
   */
  getDefault(key: AppSettingsKey): string | number | boolean {
    return this.coerce(SETTINGS_DEFAULTS[key], key);
  }

  private coerce(value: string, key: AppSettingsKey): string | number | boolean {
    if (BOOLEAN_KEYS.includes(key)) {
      return value === 'true';
    }
    if (NUMBER_KEYS.includes(key)) {
      const num = Number(value);
      return Number.isNaN(num) ? value : num;
    }
    return value;
  }

  private validate(key: AppSettingsKey, value: unknown): void {
    const schema = SETTINGS_SCHEMA[key];
    if (!schema) {
      throw new Error(`Invalid setting key: '${key}'`);
    }

    if (schema.type === 'boolean') {
      if (value !== true && value !== false && value !== 'true' && value !== 'false') {
        throw new Error(`Invalid value for '${key}': ${String(value)}. Expected boolean (true/false).`);
      }
    } else if (schema.type === 'number') {
      const num = typeof value === 'number' ? value : Number(value);
      if (Number.isNaN(num)) {
        throw new Error(`Invalid value for '${key}': ${String(value)}. Expected a number.`);
      }
      if (schema.min !== undefined && schema.max !== undefined) {
        if (num < schema.min || num > schema.max) {
          throw new Error(`Invalid value for '${key}': ${num}. Expected between ${schema.min} and ${schema.max}.`);
        }
      }
    } else if (schema.type === 'string') {
      if (typeof value !== 'string') {
        throw new Error(`Invalid value for '${key}': ${String(value)}. Expected a string.`);
      }
      if (schema.allowedValues && !schema.allowedValues.includes(value)) {
        throw new Error(`Invalid value for '${key}': '${value}'. Expected one of: ${schema.allowedValues.join(', ')}.`);
      }
    }
  }
}
