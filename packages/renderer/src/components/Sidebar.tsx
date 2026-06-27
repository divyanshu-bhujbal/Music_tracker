import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import MenuIcon from '@mui/icons-material/Menu';
import SettingsIcon from '@mui/icons-material/Settings';
import { SyncStatusPanel, type SyncStatus } from './SyncStatusPanel.js';
import { CategoryNav } from './CategoryNav.js';

const COLLAPSED_WIDTH = 56;
const EXPANDED_WIDTH = 280;

function loadCollapsedState(): boolean {
  try {
    const stored = localStorage.getItem('sidebar-collapsed');
    return stored !== null ? stored === 'true' : true;
  } catch {
    return true;
  }
}

function saveCollapsedState(collapsed: boolean) {
  try {
    localStorage.setItem('sidebar-collapsed', String(collapsed));
  } catch {
    // localStorage unavailable
  }
}

interface SidebarProps {
  desktopOpen: boolean;
  mobileOpen: boolean;
  onDesktopToggle: () => void;
  onMobileClose: () => void;
  syncStatus: SyncStatus;
  lastSyncTime: string | null;
  pendingChanges: number;
  onSync: () => void;
}

export function Sidebar({
  desktopOpen,
  mobileOpen,
  onDesktopToggle,
  onMobileClose,
  syncStatus,
  lastSyncTime,
  pendingChanges,
  onSync,
}: SidebarProps) {
  const [collapsed] = useState(loadCollapsedState);
  const navigate = useNavigate();

  const handleCollapseToggle = useCallback(() => {
    saveCollapsedState(!desktopOpen);
    onDesktopToggle();
  }, [desktopOpen, onDesktopToggle]);

  const sidebarContent = (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: desktopOpen ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
        transition: 'width 0.2s ease',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: desktopOpen ? 'space-between' : 'center',
          px: desktopOpen ? 2 : 0,
          py: 1,
          minHeight: 48,
        }}
      >
        {desktopOpen && (
          <Typography variant="h6" noWrap>
            Collectio
          </Typography>
        )}
        <IconButton onClick={handleCollapseToggle} size="small" aria-label="Toggle sidebar">
          <MenuIcon />
        </IconButton>
      </Box>

      <Divider />

      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: desktopOpen ? 'stretch' : 'center', px: desktopOpen ? 1 : 0, py: 1, gap: 0.5 }}>
        <SyncStatusPanel
          status={syncStatus}
          lastSyncTime={lastSyncTime}
          pendingChanges={pendingChanges}
          onSync={onSync}
          collapsed={!desktopOpen}
        />
      </Box>

      <Divider />

      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: desktopOpen ? 'stretch' : 'center', px: desktopOpen ? 1 : 0, py: 1 }}>
        <CategoryNav collapsed={!desktopOpen} />
      </Box>

      <Divider />

      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: desktopOpen ? 'stretch' : 'center', px: desktopOpen ? 1 : 0, py: 1 }}>
        {desktopOpen ? (
          <ListItemButton onClick={() => navigate('/settings')} sx={{ borderRadius: 1 }}>
            <ListItemIcon sx={{ minWidth: 40 }}>
              <SettingsIcon />
            </ListItemIcon>
            <ListItemText primary="Settings" />
          </ListItemButton>
        ) : (
          <IconButton onClick={() => navigate('/settings')} size="small" aria-label="Settings">
            <SettingsIcon />
          </IconButton>
        )}
      </Box>
    </Box>
  );

  return (
    <>
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { width: EXPANDED_WIDTH },
        }}
      >
        {sidebarContent}
      </Drawer>
      <Drawer
        variant="permanent"
        open={desktopOpen}
        sx={{
          display: { xs: 'none', md: 'block' },
          '& .MuiDrawer-paper': {
            width: desktopOpen ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
            transition: 'width 0.2s ease',
            overflowX: 'hidden',
          },
        }}
      >
        {sidebarContent}
      </Drawer>
    </>
  );
}

export { COLLAPSED_WIDTH, EXPANDED_WIDTH };
