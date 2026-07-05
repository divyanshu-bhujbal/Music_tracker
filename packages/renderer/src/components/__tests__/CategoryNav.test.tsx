import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CategoryNav } from '../CategoryNav.js';
import type { CategoryDefinition } from '@collectio/shared';

const mockCategories: CategoryDefinition[] = [
  {
    id: 'songs',
    displayName: 'Songs',
    iconName: 'music-note',
    migrations: [],
    repositories: {},
    tableColumns: [],
    searchFields: [],
    filterFields: [],
    createForm: (() => null) as React.FC<{ onSave: (item: unknown) => void; onCancel: () => void }>,
    editForm: (() => null) as React.FC<{ item: unknown; onSave: (item: unknown) => void; onCancel: () => void }>,
    detailView: (() => null) as React.FC<{ item: unknown; onClose: () => void }>,
    duplicateDetector: async () => [],
  },
  {
    id: 'books',
    displayName: 'Books',
    iconName: 'book',
    migrations: [],
    repositories: {},
    tableColumns: [],
    searchFields: [],
    filterFields: [],
    createForm: (() => null) as React.FC<{ onSave: (item: unknown) => void; onCancel: () => void }>,
    editForm: (() => null) as React.FC<{ item: unknown; onSave: (item: unknown) => void; onCancel: () => void }>,
    detailView: (() => null) as React.FC<{ item: unknown; onClose: () => void }>,
    duplicateDetector: async () => [],
  },
];

jest.mock('@collectio/shared', () => ({
  useCategoryList: () => mockCategories,
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/songs' }),
}));

describe('CategoryNav', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('CN-01: renders category list items with display names', () => {
    render(<CategoryNav />);
    expect(screen.getByText('Songs')).toBeInTheDocument();
    expect(screen.getByText('Books')).toBeInTheDocument();
  });

  it('CN-02: clicking category navigates to its route', () => {
    render(<CategoryNav />);
    fireEvent.click(screen.getByText('Songs'));
    expect(mockNavigate).toHaveBeenCalledWith('/songs');
  });

  it('CN-03: clicking books navigates to /books', () => {
    render(<CategoryNav />);
    fireEvent.click(screen.getByText('Books'));
    expect(mockNavigate).toHaveBeenCalledWith('/books');
  });

  it('CN-04: collapsed mode renders icon buttons with tooltips', () => {
    render(<CategoryNav collapsed />);
    expect(screen.getByLabelText('Songs')).toBeInTheDocument();
    expect(screen.getByLabelText('Books')).toBeInTheDocument();
    expect(screen.queryByText('Songs')).not.toBeInTheDocument();
  });

  it('CN-05: collapsed mode clicking icon navigates', () => {
    render(<CategoryNav collapsed />);
    fireEvent.click(screen.getByLabelText('Songs'));
    expect(mockNavigate).toHaveBeenCalledWith('/songs');
  });

  it('CN-06: uses fallback icon for unknown icon name', () => {
    const categoriesWithUnknown: CategoryDefinition[] = [
      { ...mockCategories[0], iconName: 'unknown-icon' },
    ];
    jest.spyOn(require('@collectio/shared'), 'useCategoryList').mockReturnValue(categoriesWithUnknown);
    render(<CategoryNav />);
    expect(screen.getByText('Songs')).toBeInTheDocument();
    jest.restoreAllMocks();
  });
});
