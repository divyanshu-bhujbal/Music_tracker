import { useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import Box from '@mui/material/Box';
import CssBaseline from '@mui/material/CssBaseline';
import { Sidebar, COLLAPSED_WIDTH, EXPANDED_WIDTH } from './Sidebar.js';
import type { SyncStatus } from './SyncStatusPanel.js';

export function MainLayout() {
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleDesktopToggle = useCallback(() => {
    setDesktopOpen((prev) => !prev);
  }, []);

  const handleMobileClose = useCallback(() => {
    setMobileOpen(false);
  }, []);

  const sidebarWidth = desktopOpen ? EXPANDED_WIDTH : COLLAPSED_WIDTH;

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
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
