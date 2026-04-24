import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CountrySelect } from './CountrySelect';

describe('CountrySelect', () => {
  it('renders placeholder when no value', () => {
    render(<CountrySelect value={null} onChange={() => {}} placeholder="Your country" />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Your country');
  });
});
