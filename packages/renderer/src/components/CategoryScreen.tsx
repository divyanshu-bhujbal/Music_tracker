import { useState, useCallback, useEffect } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import AddIcon from '@mui/icons-material/Add';
import TableChartIcon from '@mui/icons-material/TableChart';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import Tooltip from '@mui/material/Tooltip';
import type { CategoryDefinition, DatabaseConnection, SongWithArtists } from '@collectio/shared';
import { SearchBar } from './SearchBar.js';
import { FilterBar } from './FilterBar.js';
import { TableView } from './TableView.js';
import { TileView } from './TileView.js';
import { SelectionModeBar } from './SelectionModeBar.js';

import { useSearchFilterStore, useSearchText, useColumnFilters, useActiveSort } from './useSearchFilterStore.js';
import { useSelectionStore } from '../stores/useSelectionStore.js';
import { useSelectionCount } from '../stores/useSelectionStore.js';
import { useFilteredSongs, useLanguages } from '../categories/songs/store/useSongsStore.js';
import { SongCreateDialog } from '../categories/songs/components/SongCreateDialog.js';
import { SongEditDialog } from '../categories/songs/components/SongEditDialog.js';
import { SongDetailDialog } from '../categories/songs/components/SongDetailDialog.js';
import { useServiceProvider } from '../ServiceProviderContext.js';

interface CategoryScreenProps {
  category: CategoryDefinition;
}

let _db: DatabaseConnection | null = null;

export function CategoryScreen({ category }: CategoryScreenProps) {
  const searchText = useSearchText();
  const columnFilters = useColumnFilters();
  const { sortKey, sortDirection } = useActiveSort();
  const setSearchText = useSearchFilterStore((s) => s.setSearchText);
  const clearAllFilters = useSearchFilterStore((s) => s.clearAllFilters);
  const toggleColumnFilter = useSearchFilterStore((s) => s.toggleColumnFilter);
  const clearColumnFilter = useSearchFilterStore((s) => s.clearColumnFilter);
  const setSort = useSearchFilterStore((s) => s.setSort);
  const clearSort = useSearchFilterStore((s) => s.clearSort);
  const selectionCount = useSelectionCount();

  const [viewMode, setViewMode] = useState<'table' | 'tile'>('table');
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SongWithArtists | null>(null);
  const { db: serviceDb } = useServiceProvider();
  const { data: languages = [] } = useLanguages();
  const languageMap = new Map(languages.map((l: { id: number; name: string }) => [l.id, l.name]));

  useEffect(() => {
    return () => {
      useSelectionStore.getState().clearAll();
    };
  }, []);

  const handleDeleteSelected = useCallback(() => {
    // Stub: actual bulk deletion is E-07
  }, []);

  if (serviceDb && !_db) {
    _db = serviceDb;
  }

  const { data: songs = [], isLoading, error } = useFilteredSongs(
    searchText,
    columnFilters,
    sortKey,
    sortDirection,
  );

  const handleCreateSave = useCallback(() => {
    setCreateOpen(false);
  }, []);

  const handleEditSave = useCallback(() => {
    setEditOpen(false);
    setDetailOpen(false);
  }, []);

  const handleSave = () => {
    setCreateOpen(false);
    handleCreateSave();
  };

  const handleEdit = (item: unknown) => {
    setDetailOpen(false);
    setSelectedItem(item as SongWithArtists);
    setEditOpen(true);
  };

  const handleDelete = useCallback(() => {
    setDetailOpen(false);
    setSelectedItem(null);
  }, []);

  const handleToggleSort = useCallback(
    (key: string) => {
      if (sortKey === key) {
        if (sortDirection === 'asc') {
          setSort(key, 'desc');
        } else {
          clearSort();
        }
      } else {
        setSort(key, 'asc');
      }
    },
    [sortKey, sortDirection, setSort, clearSort],
  );

  const handleRowTap = useCallback((item: SongWithArtists) => {
    setSelectedItem(item);
    setDetailOpen(true);
  }, []);

  const columnLabels: Record<string, string> = {};
  for (const col of category.tableColumns) {
    columnLabels[col.key] = col.label;
  }

  const hasActiveFilters = Object.keys(columnFilters).length > 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          px: 2,
          py: 1,
          borderBottom: 1,
          borderColor: 'divider',
          flexWrap: 'wrap',
        }}
      >
        <SearchBar
          value={searchText}
          onChange={setSearchText}
          placeholder={`Search ${category.displayName.toLowerCase()}...`}
          disabled={category.searchFields.length === 0}
        />
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateOpen(true)}
          size="small"
        >
          New {category.displayName.slice(0, -1)}
        </Button>
        <Tooltip title={viewMode === 'table' ? 'Switch to tile view' : 'Switch to table view'}>
          <IconButton
            onClick={() => setViewMode(viewMode === 'table' ? 'tile' : 'table')}
            size="small"
            aria-label={viewMode === 'table' ? 'Switch to tile view' : 'Switch to table view'}
          >
            {viewMode === 'table' ? <ViewModuleIcon /> : <TableChartIcon />}
          </IconButton>
        </Tooltip>
      </Box>

      {hasActiveFilters && (
        <FilterBar
          columnFilters={columnFilters}
          columnLabels={columnLabels}
          onRemoveFilter={(key, value) => toggleColumnFilter(key, value)}
          onRemoveColumn={(key) => clearColumnFilter(key)}
          onClearAll={clearAllFilters}
        />
      )}

      {viewMode === 'table' ? (
        <TableView
          category={category}
          items={songs}
          isLoading={isLoading}
          error={error}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={handleToggleSort}
          onRowTap={handleRowTap}
        />
      ) : (
        <TileView
          category={category}
          items={songs}
          isLoading={isLoading}
          error={error}
          onCardTap={handleRowTap}
          languageMap={languageMap}
        />
      )}

      {selectionCount > 0 && (
        <SelectionModeBar
          selectionCount={selectionCount}
          onClear={() => useSelectionStore.getState().clearAll()}
          onDeleteSelected={handleDeleteSelected}
        />
      )}

      {_db && (
        <>
          <SongCreateDialog
            open={createOpen}
            onSave={handleSave}
            onCancel={() => setCreateOpen(false)}
            db={_db}
          />
          {selectedItem && (
            <>
              <SongEditDialog
                open={editOpen}
                item={selectedItem}
                onSave={handleEditSave}
                onCancel={() => setEditOpen(false)}
              />
              <SongDetailDialog
                open={detailOpen && !editOpen}
                item={selectedItem}
                onClose={() => setDetailOpen(false)}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            </>
          )}
        </>
      )}
    </Box>
  );
}
