import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the Japanese application title', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: '水害調査マルチマップ' })).toBeInTheDocument();
  });
});

