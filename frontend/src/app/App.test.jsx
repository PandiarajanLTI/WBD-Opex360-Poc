// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';
import App from './App';

it('shows Budget Holder beside Build Forecasts in the main navigation', () => {
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );

  const navigation = within(
    screen.getByRole('navigation', { name: 'Main navigation' }),
  );
  const links = navigation.getAllByRole('link');
  expect(links.map((link) => link.textContent)).toEqual([
    'Build Forecasts',
    'Budget Holder',
  ]);
  expect(links[1].getAttribute('href')).toBe('/budget');
});
