import { provideRouter } from '@angular/router';
import { gameCatalog } from '@board-table/games/catalog';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { CatalogPage } from './catalog.page';

async function setup() {
  await render(CatalogPage, { providers: [provideRouter([])] });
}

describe('CatalogPage', () => {
  it('lists every game as a card linking to its page', async () => {
    await setup();
    expect(screen.getByRole('heading', { level: 1, name: 'Games' })).toBeTruthy();
    const list = screen.getByRole('list', { name: 'Games' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(gameCatalog.length);
    const link = within(list).getByRole('link', { name: /Tic-tac-toe/ });
    expect(link.getAttribute('href')).toBe('/games/tictactoe');
  });

  it('filters by search text and explains when nothing matches', async () => {
    await setup();
    const search = screen.getByRole('searchbox', { name: 'Search games' });
    await userEvent.type(search, 'tic');
    expect(screen.getByRole('link', { name: /Tic-tac-toe/ })).toBeTruthy();

    await userEvent.clear(search);
    await userEvent.type(search, 'zzz-no-such-game');
    expect(screen.queryByRole('list', { name: 'Games' })).toBeNull();
    expect(screen.getByRole('heading', { name: /No games match/ })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Show all games' }));
    expect((search as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('list', { name: 'Games' })).toBeTruthy();
  });

  it('announces how many games are shown', async () => {
    await setup();
    expect(screen.getByRole('status').textContent).toMatch(/1 game/);
  });

  it('filters by player count', async () => {
    await setup();
    const group = screen.getByRole('radiogroup', { name: 'Players' });
    await userEvent.click(within(group).getByRole('radio', { name: '2' }));
    expect(screen.getByRole('link', { name: /Tic-tac-toe/ })).toBeTruthy();
  });
});
