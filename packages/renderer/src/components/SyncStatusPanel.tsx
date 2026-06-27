import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Badge from '@mui/material/Badge';
import SyncIcon from '@mui/icons-material/Sync';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import CloudOffIcon from '@mui/icons-material/CloudOff';

export type SyncStatus = 'synced' | 'pending' | 'warning' | 'error' | 'offline';

interface SyncStatusPanelProps {
  status: SyncStatus;
  lastSyncTime: string | null;
  pendingChanges: number;
  onSync: () => void;
  collapsed?: boolean;
}

const statusConfig: Record<SyncStatus, { icon: React.ReactNode; color: string; label: string }> = {
  synced: { icon: <CheckCircleIcon />, color: 'success.main', label: 'Synced' },
  pending: { icon: <SyncIcon />, color: 'warning.main', label: 'Pending' },
  warning: { icon: <WarningIcon />, color: 'warning.main', label: 'Sync warning' },
  error: { icon: <ErrorIcon />, color: 'error.main', label: 'Sync error' },
  offline: { icon: <CloudOffIcon />, color: 'text.disabled', label: 'Offline' },
};

function formatRelativeTime(isoTime: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoTime).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function SyncStatusPanel({
  status,
  lastSyncTime,
  pendingChanges,
  onSync,
  collapsed = false,
}: SyncStatusPanelProps) {
  const cfg = statusConfig[status];

  if (collapsed) {
    return (
      <IconButton onClick={onSync} aria-label={`Sync status: ${cfg.label}`} size="small">
        <Badge badgeContent={pendingChanges > 0 ? pendingChanges : 0} color="warning" invisible={pendingChanges === 0}>
          <Box sx={{ color: cfg.color }}>{cfg.icon}</Box>
        </Badge>
      </IconButton>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <IconButton onClick={onSync} aria-label={`Sync status: ${cfg.label}`} size="small">
          <Badge badgeContent={pendingChanges > 0 ? pendingChanges : 0} color="warning" invisible={pendingChanges === 0}>
            <Box sx={{ color: cfg.color }}>{cfg.icon}</Box>
          </Badge>
        </IconButton>
        <Typography variant="body2" color={cfg.color}>
          {cfg.label}
        </Typography>
      </Box>
      {lastSyncTime && (
        <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>
          Last sync: {formatRelativeTime(lastSyncTime)}
        </Typography>
      )}
      {pendingChanges > 0 && (
        <Typography variant="caption" color="warning.main" sx={{ pl: 1 }}>
          {pendingChanges} pending change{pendingChanges !== 1 ? 's' : ''}
        </Typography>
      )}
    </Box>
  );
}
