import { useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import Box from '@mui/material/Box';
import CssBaseline from '@mui/material/CssBaseline';
import { Sidebar, COLLAPSED_WIDTH, EXPANDED_WIDTH } from './Sidebar.js';
import { usePlatformAdapter } from '../hooks/usePlatformAdapter.js';

export function MainLayout() {
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const platform = usePlatformAdapter();

  const handleDesktopToggle = useCallback(() => {
    setDesktopOpen((prev) => !prev);
  }, []);

  const handleMobileClose = useCallback(() => {
    setMobileOpen(false);
  }, []);

  const sidebarWidth = desktopOpen ? EXPANDED_WIDTH : COLLAPSED_WIDTH;

  return (
    <Box
      sx={{
        display: 'flex',
        height: '100vh',
        ...(platform.usesSafeAreaInsets
          ? { pt: 'env(safe-area-inset-top, 0px)', pb: 'env(safe-area-inset-bottom, 0px)' }
          : {}),
      }}
    >
      <CssBaseline />

      <Sidebar
        desktopOpen={desktopOpen}
        mobileOpen={mobileOpen}
        onDesktopToggle={handleDesktopToggle}
        onMobileClose={handleMobileClose}
        syncStatus="pending"
        lastSyncTime={null}
        pendingChanges={0}
        onSync={() => {}}
      />

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          ml: { md: `${sidebarWidth}px` },
          transition: 'margin-left 0.2s ease',
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}
