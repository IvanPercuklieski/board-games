import type { Server, State } from 'boardgame.io';
import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../testing/memory-storage';
import { WithoutInitialState } from './without-initial-state';

const state = {
  G: { secret: 'deck order' },
  ctx: {},
  plugins: {},
  _stateID: 0,
} as unknown as State;
const metadata = { gameName: 'g', players: {}, createdAt: 0, updatedAt: 0 } as Server.MatchData;

describe('WithoutInitialState', () => {
  it('never returns the initial state, which boardgame.io would send unfiltered on sync', async () => {
    const inner = new MemoryStorage();
    const db = new WithoutInitialState(inner);
    await db.createMatch('m', { initialState: state, metadata });

    const all = await db.fetch('m', { state: true, metadata: true, log: true, initialState: true });
    expect(all).not.toHaveProperty('initialState');
    expect(all).toMatchObject({ state, metadata, log: [] });
    expect((await inner.fetch('m', { initialState: true })).initialState).toEqual(state);
  });

  it('passes every write through', async () => {
    const inner = new MemoryStorage();
    const db = new WithoutInitialState(inner);
    await db.createMatch('m', { initialState: state, metadata });
    await db.setState('m', { ...state, _stateID: 1 });
    expect((await inner.fetch('m', { state: true })).state?._stateID).toBe(1);
    expect(await db.listMatches()).toEqual(['m']);
    expect(await db.setPlayerSeat('m', 0, { name: 'A', credentialsHash: 'h' })).toBe(false);
    await db.wipe('m');
    expect(await inner.listMatches()).toEqual([]);
  });
});
