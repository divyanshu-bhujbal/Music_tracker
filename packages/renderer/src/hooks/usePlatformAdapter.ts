import { createContext, useContext } from 'react';
import type { PlatformAdapter } from '@collectio/shared';

export const noopPlatformAdapter: PlatformAdapter = {
  supportsHover: false,
  supportsContextMenu: false,
  supportsKeyboardShortcuts: false,
  hasBackButton: false,
  touchTargetSize: 0,
  columnWidthScale: 1.0,
  usesSafeAreaInsets: false,
  showContextMenu: () => {},
  onKeyboardShortcut: () => () => {},
  onBackButton: () => () => {},
};

export const PlatformAdapterContext = createContext<PlatformAdapter>(noopPlatformAdapter);

export function usePlatformAdapter(): PlatformAdapter {
  return useContext(PlatformAdapterContext);
}
