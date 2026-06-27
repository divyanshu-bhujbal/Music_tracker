import { useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import AddIcon from '@mui/icons-material/Add';
import type { CategoryDefinition, DatabaseConnection, SongWithArtists } from '@collectio/shared';
import { SearchBar } from './SearchBar.js';
import { FilterBar } from './FilterBar.js';
import { TableView } from './TableView.js';
import { TileView } from './TileView.js';
import { SelectionModeBar } from './SelectionModeBar.js';
import { useSearchFilterStore, useSearchText, useColumnFilters, useActiveSort } from './useSearchFilterStore.js';
import { useFilteredSongs } from '../categories/songs/store/useSongsStore.js';
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
  const setSort = useSearchFilterStore((s) => s.setSort);
  const clearAllFilters = useSearchFilterStore((s) => s.clearAllFilters);
  const toggleColumnFilter = useSearchFilterStore((s) => s.toggleColumnFilter);
  const clearColumnFilter = useSearchFilterStore((s) => s.clearColumnFilter);

  const [viewMode, setViewMode] = useState<'table' | 'tile'>('table');
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SongWithArtists | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { db: serviceDb } = useServiceProvider();

  if (serviceDb && !_db) {
    _db = serviceDb;
  }

  const { data: songs = [], isLoading, error } = useFilteredSongs(
    searchText,
    columnFilters,
    sortKey,
    sortDirection,
  );

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      if (sortDirection === 'asc') {
        setSort(key, 'desc');
      } else {
        setSort(null, 'desc');
      }
    } else {
      setSort(key, 'asc');
    }
  }, [sortKey, sortDirection, setSort]);

  const handleRowClick = useCallback((item: SongWithArtists) => {
    setSelectedItem(item);
    setDetailOpen(true);
  }, []);

  const handleCreateSave = useCallback((_item: unknown) => {
    setCreateOpen(false);
  }, []);

  const handleEditSave = useCallback((_item: unknown) => {
    setEditOpen(false);
    setDetailOpen(false);
  }, []);

  const handleSave = (item: unknown) => {
    setCreateOpen(false);
    handleCreateSave(item);
  };

  const handleEdit = (item: unknown) => {
    setDetailOpen(false);
    setSelectedItem(item as SongWithArtists);
    setEditOpen(true);
  };

  const handleDelete = useCallback((_id: string) => {
    setDetailOpen(false);
    setSelectedItem(null);
  }, []);

  const handleSelectionChange = useCallback((ids: Set<string>) => {
    setSelectedIds(ids);
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
        <Button
          variant="outlined"
          size="small"
          onClick={() => setViewMode(viewMode === 'table' ? 'tile' : 'table')}
        >
          {viewMode === 'table' ? 'Tile View' : 'Table View'}
        </Button>
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

      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {viewMode === 'table' ? (
          <TableView
            category={category}
            data={songs}
            isLoading={isLoading}
            error={error}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={handleSort}
            onRowClick={handleRowClick}
            selectedIds={selectedIds}
            onSelectionChange={handleSelectionChange}
          />
        ) : (
          <TileView
            category={category}
            data={songs}
            isLoading={isLoading}
            error={error}
            onItemClick={handleRowClick}
          />
        )}
      </Box>

      {selectedIds.size > 0 && (
        <SelectionModeBar
          selectedCount={selectedIds.size}
          onClearSelection={() => setSelectedIds(new Set())}
          onDeleteSelected={() => {}}
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
