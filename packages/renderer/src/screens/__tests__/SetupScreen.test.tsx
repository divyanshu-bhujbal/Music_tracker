import React from 'react';
import { render, screen } from '@testing-library/react';
import { SetupScreen } from '../SetupScreen.js';

describe('SetupScreen', () => {
  it('SS-01: renders setup placeholder text', () => {
    render(<SetupScreen />);
    expect(screen.getByText('Setup (not yet implemented)')).toBeInTheDocument();
  });
});
