/**
 * Platform capability adapter interface.
 *
 * Exposes capability flags (NOT platform identity strings) so renderer
 * components can branch on what the platform supports without importing
 * platform-specific code. Defined in @collectio/shared; injected by app entry points.
 *
 * Source: E15-T10 Implementation Specification §6.1
 */

export interface ContextMenuItem {
  id: string;
  label: string;
  action: () => void;
}

export interface PlatformAdapter {
  /** True if the platform supports mouse hover states (desktop — Electron) */
  readonly supportsHover: boolean;

  /** True if the platform supports right-click context menus */
  readonly supportsContextMenu: boolean;

  /** True if the platform supports global keyboard shortcuts */
  readonly supportsKeyboardShortcuts: boolean;

  /** True if the platform has a hardware/system back button (Android) */
  readonly hasBackButton: boolean;

  /** Minimum touch target size in CSS pixels (0 = no minimum; use for mouse platforms) */
  readonly touchTargetSize: number;

  /** Multiplier applied to default column widths (1.0 = default; >1.0 = wider for desktop) */
  readonly columnWidthScale: number;

  /** True if the platform uses safe area insets (notched phones) */
  readonly usesSafeAreaInsets: boolean;

  /** Show a native context menu at the current pointer position. No-op if unsupported. */
  showContextMenu(items: ContextMenuItem[]): void;

  /** Register a callback for a keyboard shortcut (Electron accelerator format: 'CommandOrControl+N').
   *  Returns an unsubscribe function. No-op if unsupported. */
  onKeyboardShortcut(shortcut: string, callback: () => void): () => void;

  /** Register a callback for the platform back button (Android hardware back).
   *  Returns an unsubscribe function. No-op if unsupported. */
  onBackButton(callback: () => void): () => void;
}
