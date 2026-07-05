import { render, screen } from '@testing-library/react';
import { UnlockScreen } from '../UnlockScreen.js';

describe('UnlockScreen', () => {
  it('US-01: renders unlock placeholder text', () => {
    render(<UnlockScreen />);
    expect(screen.getByText('Unlock (not yet implemented)')).toBeInTheDocument();
  });
});
