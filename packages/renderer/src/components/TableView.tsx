import { useCallback, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Checkbox from '@mui/material/Checkbox';
import Table from '@mui/material/Table';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import InboxIcon from '@mui/icons-material/Inbox';
import type { CategoryDefinition, ColumnDefinition, SongWithArtists } from '@collectio/shared';
import { useSelectionStore } from '../stores/useSelectionStore.js';

export interface TableViewProps {
  category: CategoryDefinition;
  items: SongWithArtists[];
  isLoading: boolean;
  error: Error | null;
  sortKey: string | null;
  sortDirection: 'asc' | 'desc' | null;
  onSort: (key: string) => void;
  onRowTap: (item: SongWithArtists) => void;
}

function computeGridTemplate(columns: ColumnDefinition[]): string {
  const hasSelection = columns.some((c) => c.key === 'selection');
  const parts: string[] = [];

  if (hasSelection) {
    parts.push('48px');
  }

  for (const col of columns) {
    if (col.key === 'selection') continue;
    if (col.fixedWidth) {
      parts.push(`${col.fixedWidth}px`);
    } else {
      parts.push(`${col.flex}fr`);
    }
  }

  return parts.join(' ');
}

function getRowValue(item: SongWithArtists, key: string): string {
  switch (key) {
    case 'name':
      return item.name;
    case 'artists':
      return item.artists.map((a) => a.display_name).join(', ') || '\u2014';
    case 'album_name':
      return item.album_name ?? '\u2014';
    case 'language_id':
      return String(item.language_id);
    case 'added_at':
      return new Date(item.added_at).toLocaleDateString();
    default:
      return '';
  }
}

function SortIcon({
  columnKey,
  sortKey,
  sortDirection,
}: {
  columnKey: string;
  sortKey: string | null;
  sortDirection: 'asc' | 'desc' | null;
}) {
  if (sortKey !== columnKey || !sortDirection) {
    return <UnfoldMoreIcon sx={{ fontSize: 16, opacity: 0.5 }} />;
  }
  return sortDirection === 'asc' ? (
    <ArrowUpwardIcon sx={{ fontSize: 16 }} />
  ) : (
    <ArrowDownwardIcon sx={{ fontSize: 16 }} />
  );
}

export function TableView({
  category,
  items,
  isLoading,
  error,
  sortKey,
  sortDirection,
  onSort,
  onRowTap,
}: TableViewProps) {
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const toggle = useSelectionStore((s) => s.toggle);
  const selectAll = useSelectionStore((s) => s.selectAll);
  const clearAll = useSelectionStore((s) => s.clearAll);

  const columnTemplate = useMemo(
    () => computeGridTemplate(category.tableColumns),
    [category.tableColumns],
  );

  const dataColumns = useMemo(
    () => category.tableColumns.filter((c) => c.key !== 'selection'),
    [category.tableColumns],
  );

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 48,
    overscan: 5,
  });

  const allSelected = items.length > 0 && items.every((item) => selectedIds.has(item.id));

  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      clearAll();
    } else {
      selectAll(items.map((item) => item.id));
    }
  }, [allSelected, items, clearAll, selectAll]);

  const handleRowSelect = useCallback((id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    toggle(id);
  }, [toggle]);

  const handleRowClick = useCallback(
    (item: SongWithArtists) => {
      onRowTap(item);
    },
    [onRowTap],
  );

  const handleHeaderClick = useCallback(
    (col: ColumnDefinition) => {
      if (col.sortable) {
        onSort(col.key);
      }
    },
    [onSort],
  );

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, p: 2 }}>
        <Alert severity="error" sx={{ maxWidth: 400 }}>
          {error.message}
        </Alert>
      </Box>
    );
  }

  if (items.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          flex: 1,
          gap: 1,
          color: 'text.secondary',
        }}
      >
        <InboxIcon sx={{ fontSize: 48 }} />
        <Typography variant="body1">
          No {category.displayName.toLowerCase()} found
        </Typography>
      </Box>
    );
  }

  if (dataColumns.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
        <Typography variant="body2" color="text.secondary">
          No columns configured for {category.displayName}
        </Typography>
      </Box>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <Box ref={tableContainerRef} sx={{ flex: 1, overflow: 'auto' }}>
        <Table size="small" sx={{ tableLayout: 'fixed' }}>
          <TableHead>
            <TableRow
              sx={{ display: 'grid', gridTemplateColumns: columnTemplate, position: 'sticky', top: 0, zIndex: 1, bgcolor: 'background.paper' }}
            >
              <TableCell sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Checkbox
                  checked={allSelected}
                  indeterminate={!allSelected && selectedIds.size > 0}
                  onChange={handleSelectAll}
                  size="small"
                  inputProps={{ 'aria-label': 'Select all' }}
                />
              </TableCell>
              {dataColumns.map((col) => (
                <TableCell
                  key={col.key}
                  sx={{
                    cursor: col.sortable ? 'pointer' : 'default',
                    userSelect: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                  }}
                  onClick={() => handleHeaderClick(col)}
                >
                  <Typography variant="body2" fontWeight={col.key === sortKey ? 700 : 400} noWrap>
                    {col.label}
                  </Typography>
                  {col.sortable && (
                    <SortIcon columnKey={col.key} sortKey={sortKey} sortDirection={sortDirection} />
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
        </Table>

        <Box sx={{ position: 'relative', height: virtualizer.getTotalSize() }}>
          {virtualItems.map((virtualRow) => {
            const item = items[virtualRow.index];
            return (
              <Box
                key={item.id}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: columnTemplate,
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  borderBottom: 1,
                  borderColor: 'divider',
                  alignItems: 'center',
                  minHeight: 48,
                  px: 1,
                  '&:hover': { bgcolor: 'action.hover' },
                  cursor: 'pointer',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                onClick={() => handleRowClick(item)}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Checkbox
                    checked={selectedIds.has(item.id)}
                    onChange={(e) => handleRowSelect(item.id, e)}
                    size="small"
                    onClick={(e) => e.stopPropagation()}
                    inputProps={{ 'aria-label': `Select ${item.name}` }}
                  />
                </Box>
                {dataColumns.map((col) => (
                  <Box
                    key={col.key}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      px: 1,
                      overflow: 'hidden',
                    }}
                  >
                    <Typography variant="body2" noWrap>
                      {getRowValue(item, col.key)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}
