import type { LogEntry, Server, State } from 'boardgame.io';
import type { Async } from 'boardgame.io/internal';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Shared behaviour every boardgame.io storage implementation must satisfy. */
export function describeStorageContract(
  name: string,
  setup: () => Promise<{ db: Async; cleanup: (matchIDs: string[]) => Promise<void> }>,
) {
  describe(`${name} storage contract`, () => {
    let db: Async;
    let cleanup: (matchIDs: string[]) => Promise<void>;
    const created: string[] = [];
    const prefix = `test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    let n = 0;
    const newID = () => {
      const id = `${prefix}-${n++}`;
      created.push(id);
      return id;
    };

    beforeAll(async () => {
      ({ db, cleanup } = await setup());
      await db.connect();
    });
    afterAll(async () => {
      await cleanup(created);
    });

    const metadata = (gameName = 'tictactoe', extra: Partial<Server.MatchData> = {}) =>
      ({
        gameName,
        players: { 0: { id: 0 }, 1: { id: 1 } },
        createdAt: 1000,
        updatedAt: 1000,
        ...extra,
      }) as Server.MatchData;
    const state = (stateID: number, G: unknown = { cells: [] }) =>
      ({ G, ctx: { turn: stateID }, _stateID: stateID, plugins: {} }) as unknown as State;
    const logEntry = (turn: number) =>
      ({
        action: { type: 'MAKE_MOVE', payload: { type: 'clickCell', args: [turn] } },
        _stateID: turn,
        turn,
        phase: '',
      }) as unknown as LogEntry;

    it('creates a match and fetches each field', async () => {
      const id = newID();
      await db.createMatch(id, { initialState: state(0), metadata: metadata() });
      const all = await db.fetch(id, {
        state: true,
        initialState: true,
        metadata: true,
        log: true,
      });
      expect(all.state).toEqual(state(0));
      expect(all.initialState).toEqual(state(0));
      expect(all.metadata).toEqual(metadata());
      expect(all.log).toEqual([]);
    });

    it('fetches only the requested fields', async () => {
      const id = newID();
      await db.createMatch(id, { initialState: state(0), metadata: metadata() });
      const res = await db.fetch(id, { metadata: true });
      expect(Object.keys(res)).toEqual(['metadata']);
    });

    it('returns an empty result for an unknown match', async () => {
      expect(await db.fetch(`${prefix}-missing`, { state: true, metadata: true })).toEqual({});
    });

    it('updates state and appends the delta log', async () => {
      const id = newID();
      await db.createMatch(id, { initialState: state(0), metadata: metadata() });
      await db.setState(id, state(1), [logEntry(1)]);
      await db.setState(id, state(2), [logEntry(2)]);
      await db.setState(id, state(3));
      const res = await db.fetch(id, { state: true, initialState: true, log: true });
      expect(res.state).toEqual(state(3));
      expect(res.initialState).toEqual(state(0));
      expect(res.log).toEqual([logEntry(1), logEntry(2)]);
    });

    it('updates metadata', async () => {
      const id = newID();
      await db.createMatch(id, { initialState: state(0), metadata: metadata() });
      const updated = metadata('tictactoe', {
        players: { 0: { id: 0, name: 'Alice', credentials: 'secret' }, 1: { id: 1 } },
        updatedAt: 2000,
      });
      await db.setMetadata(id, updated);
      expect((await db.fetch(id, { metadata: true })).metadata).toEqual(updated);
    });

    it('wipes a match', async () => {
      const id = newID();
      await db.createMatch(id, { initialState: state(0), metadata: metadata() });
      await db.wipe(id);
      expect(await db.fetch(id, { state: true })).toEqual({});
    });

    it('lists matches filtered by game, gameover and update time', async () => {
      const game = `${prefix}-game`;
      const a = newID();
      const b = newID();
      const c = newID();
      await db.createMatch(a, {
        initialState: state(0),
        metadata: metadata(game, { updatedAt: 100 }),
      });
      await db.createMatch(b, {
        initialState: state(0),
        metadata: metadata(game, { updatedAt: 200, gameover: { draw: true } }),
      });
      await db.createMatch(c, { initialState: state(0), metadata: metadata(`${game}-other`) });

      expect((await db.listMatches({ gameName: game })).sort()).toEqual([a, b].sort());
      expect(await db.listMatches({ gameName: game, where: { isGameover: true } })).toEqual([b]);
      expect(await db.listMatches({ gameName: game, where: { isGameover: false } })).toEqual([a]);
      expect(await db.listMatches({ gameName: game, where: { updatedBefore: 150 } })).toEqual([a]);
      expect(await db.listMatches({ gameName: game, where: { updatedAfter: 150 } })).toEqual([b]);
    });
  });
}
