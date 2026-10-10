import { render, screen, within } from '@testing-library/angular';
import type { SessionPlayer } from '../game-client/game-session';
import { describeGameOver } from './describe-game-over';
import { PlayerStripComponent } from './player-strip.component';
import { TurnBannerComponent } from './turn-banner.component';

const players: SessionPlayer[] = [
  { playerID: '0', seatIndex: 0, name: 'Ivan', isYou: false, isCurrent: false, isConnected: true },
  { playerID: '1', seatIndex: 1, name: 'Mara', isYou: true, isCurrent: true, isConnected: true },
];

describe('describeGameOver', () => {
  it.each([
    [{ winner: '1' }, 'You won!'],
    [{ winner: '0' }, 'Ivan won'],
    [{ draw: true }, 'It’s a draw'],
    [{ something: 'else' }, 'Game over'],
    ['weird', 'Game over'],
  ])('%j -> %s', (gameover, text) => {
    expect(describeGameOver(gameover, players)).toBe(text);
  });
});

describe('PlayerStripComponent', () => {
  it('lists players, marks you and whose turn it is', async () => {
    await render(PlayerStripComponent, { inputs: { players } });
    const list = screen.getByRole('list', { name: 'Players' });
    const [ivan, mara] = within(list).getAllByRole('listitem');
    expect(within(ivan!).getByText('Ivan')).toBeTruthy();
    expect(within(mara!).getByText('Mara')).toBeTruthy();
    expect(within(mara!).getByText('Turn')).toBeTruthy();
    expect(mara!.getAttribute('aria-current')).toBe('true');
    expect(ivan!.getAttribute('aria-current')).toBeNull();
  });

  it('shows when a player has lost their connection', async () => {
    await render(PlayerStripComponent, {
      inputs: { players: [{ ...players[0]!, isConnected: false }, players[1]!] },
    });
    expect(screen.getByText('Away')).toBeTruthy();
  });
});

describe('TurnBannerComponent', () => {
  it('announces your turn', async () => {
    await render(TurnBannerComponent, { inputs: { players, gameover: undefined } });
    expect(screen.getByRole('status').textContent?.trim()).toBe('Your turn');
  });

  it('announces whose turn it is', async () => {
    await render(TurnBannerComponent, {
      inputs: {
        players: [
          { ...players[0]!, isCurrent: true },
          { ...players[1]!, isCurrent: false },
        ],
        gameover: undefined,
      },
    });
    expect(screen.getByRole('status').textContent?.trim()).toBe('Ivan’s turn');
  });

  it('announces the result', async () => {
    await render(TurnBannerComponent, { inputs: { players, gameover: { draw: true } } });
    expect(screen.getByRole('status').textContent?.trim()).toBe('It’s a draw');
  });
});
