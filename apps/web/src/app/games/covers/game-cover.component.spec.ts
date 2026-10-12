import { render } from '@testing-library/angular';
import { GameCoverComponent } from './game-cover.component';

describe('GameCoverComponent', () => {
  it('shows the Catan cover: seven lands with a road, a settlement and a city', async () => {
    const { container } = await render(GameCoverComponent, { inputs: { gameId: 'catan' } });
    expect(container.querySelector('bt-catan-cover')).toBeTruthy();
    expect(container.querySelectorAll('polygon.tile')).toHaveLength(7);
    expect(container.querySelector('.settlement')).toBeTruthy();
    expect(container.querySelector('.city')).toBeTruthy();
  });

  it('shows the tic-tac-toe cover', async () => {
    const { container } = await render(GameCoverComponent, { inputs: { gameId: 'tictactoe' } });
    expect(container.querySelector('bt-tictactoe-cover')).toBeTruthy();
  });

  it('falls back to a die for games without a cover', async () => {
    const { container } = await render(GameCoverComponent, { inputs: { gameId: 'nope' } });
    expect(container.querySelector('bt-icon')).toBeTruthy();
    expect(container.querySelector('svg polygon')).toBeNull();
  });
});
