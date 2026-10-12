import { Catan, type CatanState } from '@board-table/games';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { Client } from 'boardgame.io/client';
import { PIECE_ANIMATOR, PREFERS_REDUCED_MOTION } from '../../game-kit/place-piece.directive';
import { CatanMapComponent, type MapTargets } from './catan-map.component';

/** A fresh start state from the real rules (random island). */
function startState(numPlayers = 3): CatanState {
  const client = Client({ game: Catan, numPlayers, debug: false });
  client.start();
  const G = structuredClone(client.getState()!.G) as CatanState;
  client.stop();
  return G;
}

async function renderMap(state: CatanState, targets: MapTargets | null = null) {
  const picked = vi.fn();
  const view = await render(CatanMapComponent, {
    inputs: { state, targets },
    on: { picked },
    providers: [
      { provide: PIECE_ANIMATOR, useValue: () => ({ stop: () => undefined }) },
      { provide: PREFERS_REDUCED_MOTION, useValue: () => false },
    ],
  });
  return { ...view, picked };
}

describe('CatanMapComponent', () => {
  it('draws every land with its number and describes the island', async () => {
    const G = startState();
    const { container } = await renderMap(G);
    expect(container.querySelectorAll('polygon.tile')).toHaveLength(19);
    expect(container.querySelectorAll('.token')).toHaveLength(18);
    expect(container.querySelectorAll('.harbour')).toHaveLength(9);
    const img = screen.getByRole('img');
    expect(img.getAttribute('aria-label')).toMatch(
      /^Island of 19 lands\. The Bandit is on desert\./,
    );
    expect(img.getAttribute('aria-label')).toMatch(/3:1 harbour by /);
  });

  it('draws the large island for five or six players', async () => {
    const { container } = await renderMap(startState(6));
    expect(container.querySelectorAll('polygon.tile')).toHaveLength(30);
    expect(container.querySelectorAll('.harbour')).toHaveLength(11);
  });

  it('draws roads and buildings in seat colours', async () => {
    const G = startState();
    G.roads[0] = '1';
    G.buildings[0] = { owner: '1', kind: 'settlement' };
    G.buildings[10] = { owner: '2', kind: 'city' };
    const { container } = await renderMap(G);
    expect(container.querySelectorAll('.road')).toHaveLength(1);
    const fill = container.querySelector<SVGLineElement>('.road .fill')!;
    expect(fill.style.stroke).toBe('var(--bt-color-seat-1)');
    expect(container.querySelectorAll('.building')).toHaveLength(2);
  });

  it('offers legal spots as labelled buttons and reports the pick', async () => {
    const G = startState();
    const { picked } = await renderMap(G, {
      kind: 'vertex',
      ids: [0, 5],
      verb: 'Build a settlement',
    });
    const group = screen.getByRole('group', { name: 'Build a settlement' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]!.getAttribute('aria-label')).toMatch(/^Build a settlement: coast corner of /);
    await userEvent.click(buttons[1]!);
    expect(picked).toHaveBeenCalledWith(5);
  });

  it('names sides and lands for road and bandit targets', async () => {
    const G = startState();
    await renderMap(G, { kind: 'hex', ids: [9], verb: 'Move the Bandit' });
    expect(screen.getByRole('button').getAttribute('aria-label')).toMatch(
      /^Move the Bandit: (forest|hills|pasture|fields|mountains|desert)/,
    );
  });

  it('has no buttons when there is nothing to pick', async () => {
    await renderMap(startState());
    expect(screen.queryAllByRole('button')).toEqual([]);
  });
});
