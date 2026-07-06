import type { PlatformAdapter } from '@collectio/shared';

/**
 * Shared mock factory for PlatformAdapter in tests.
 * Returns a PlatformAdapter with configurable capability flags.
 */
export function createMockPlatformAdapter(
  overrides?: Partial<PlatformAdapter>,
): PlatformAdapter {
  return {
    supportsHover: false,
    supportsContextMenu: false,
    supportsKeyboardShortcuts: false,
    hasBackButton: false,
    touchTargetSize: 0,
    columnWidthScale: 1.0,
    usesSafeAreaInsets: false,
    showContextMenu: jest.fn(),
    onKeyboardShortcut: jest.fn().mockReturnValue(jest.fn()),
    onBackButton: jest.fn().mockReturnValue(jest.fn()),
    ...overrides,
  };
}
