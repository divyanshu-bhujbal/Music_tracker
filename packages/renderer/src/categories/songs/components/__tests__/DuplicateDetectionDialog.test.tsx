import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DuplicateDetectionDialog } from '../DuplicateDetectionDialog.js';
import type { DuplicateCheckResult } from '@collectio/shared';

const mockResults: DuplicateCheckResult[] = [
  {
    type: 'exact',
    existingItem: {
      id: 'song-1',
      name: 'Test Song',
      album_name: 'Test Album',
      language_id: 1,
      added_at: '2024-01-01',
      updated_at: '2024-01-01',
      deleted_at: null,
    },
    resolutionOptions: ['Overwrite Existing', 'Skip Creation'],
  },
];

const mockPartialResults: DuplicateCheckResult[] = [
  {
    type: 'partial',
    existingItem: {
      id: 'song-2',
      name: 'Partial Song',
      album_name: null,
      language_id: 1,
      added_at: '2024-01-01',
      updated_at: '2024-01-01',
      deleted_at: null,
    },
    resolutionOptions: ['Merge Artists onto Existing Song', 'Create Separate Entry'],
  },
];

describe('DuplicateDetectionDialog', () => {
  it('DP-01: renders matched songs list', () => {
    render(
      <DuplicateDetectionDialog
        open={true}
        results={mockResults}
        onResolve={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByText('Test Song')).toBeInTheDocument();
    expect(screen.getByText('Duplicate Songs Found')).toBeInTheDocument();
  });

  it('DP-02: Scenario A shows Overwrite and Skip options', () => {
    render(
      <DuplicateDetectionDialog
        open={true}
        results={mockResults}
        onResolve={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByText('Overwrite Existing')).toBeInTheDocument();
    expect(screen.getByText('Skip Creation')).toBeInTheDocument();
  });

  it('DP-03: Scenario B shows Merge and Create Separate options', () => {
    render(
      <DuplicateDetectionDialog
        open={true}
        results={mockPartialResults}
        onResolve={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByText('Merge Artists onto Existing Song')).toBeInTheDocument();
    expect(screen.getByText('Create Separate Entry')).toBeInTheDocument();
  });

  it('DP-04: user selects resolution for each match', async () => {
    const user = userEvent.setup();

    render(
      <DuplicateDetectionDialog
        open={true}
        results={mockResults}
        onResolve={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    await user.click(screen.getByText('Overwrite Existing'));

    // Apply button should now be enabled (all resolved)
    const applyButton = screen.getByText('Apply');
    expect(applyButton).not.toBeDisabled();
  });

  it('DP-05: Apply calls onResolve with resolutions', async () => {
    const onResolve = jest.fn();
    const user = userEvent.setup();

    render(
      <DuplicateDetectionDialog
        open={true}
        results={mockResults}
        onResolve={onResolve}
        onCancel={jest.fn()}
      />,
    );

    await user.click(screen.getByText('Overwrite Existing'));
    await user.click(screen.getByText('Apply'));

    expect(onResolve).toHaveBeenCalledWith([
      { existingSongId: 'song-1', action: 'overwrite' },
    ]);
  });

  it('DP-06: Cancel calls onCancel', async () => {
    const onCancel = jest.fn();
    const user = userEvent.setup();

    render(
      <DuplicateDetectionDialog
        open={true}
        results={mockResults}
        onResolve={jest.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('DP-07: multiple matches all shown', () => {
    const multiResults: DuplicateCheckResult[] = [
      ...mockResults,
      {
        type: 'partial',
        existingItem: {
          id: 'song-3',
          name: 'Another Song',
          album_name: null,
          language_id: 1,
          added_at: '2024-01-01',
          updated_at: '2024-01-01',
          deleted_at: null,
        },
        resolutionOptions: ['Merge Artists onto Existing Song', 'Create Separate Entry'],
      },
    ];

    render(
      <DuplicateDetectionDialog
        open={true}
        results={multiResults}
        onResolve={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByText('Test Song')).toBeInTheDocument();
    expect(screen.getByText('Another Song')).toBeInTheDocument();
  });

  it('DP-08: no default resolution pre-selected', () => {
    render(
      <DuplicateDetectionDialog
        open={true}
        results={mockResults}
        onResolve={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    const applyButton = screen.getByText('Apply');
    expect(applyButton).toBeDisabled();
  });
});
