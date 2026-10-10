import type { LogEntry, Server, State } from 'boardgame.io';
import type { GameStorage } from './game-storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Shared behaviour every boardgame.io storage implementation must satisfy. */
export function describeStorageContract(
  name: string,
  setup: () => Promise<{ db: GameStorage; cleanup: (matchIDs: string[]) => Promise<void> }>,
) {
  describe(`${name} storage contract`, () => {
    let db: GameStorage;
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
        players: { 0: { id: 0, isConnected: true }, 1: { id: 1 } },
        updatedAt: 2000,
      });
      await db.setMetadata(id, updated);
      expect((await db.fetch(id, { metadata: true })).metadata).toEqual(updated);
    });

    describe('player identity (name + credentials) is owned by setPlayerSeat', () => {
      const seated = () =>
        metadata('tictactoe', {
          players: { 0: { id: 0, name: 'Alice', credentials: 'hash-a' }, 1: { id: 1 } },
        });

      it('gives a seat to a player and frees it again', async () => {
        const id = newID();
        await db.createMatch(id, { initialState: state(0), metadata: seated() });
        expect(await db.setPlayerSeat(id, 1, { name: 'Bob', credentialsHash: 'hash-b' })).toBe(
          true,
        );
        expect((await db.fetch(id, { metadata: true })).metadata.players[1]).toEqual({
          id: 1,
          name: 'Bob',
          credentials: 'hash-b',
        });
        expect(await db.setPlayerSeat(id, 0, undefined)).toBe(true);
        expect((await db.fetch(id, { metadata: true })).metadata.players[0]).toEqual({ id: 0 });
      });

      it('returns false for an unknown match or seat', async () => {
        const id = newID();
        await db.createMatch(id, { initialState: state(0), metadata: seated() });
        expect(await db.setPlayerSeat(`${prefix}-missing`, 0, undefined)).toBe(false);
        expect(await db.setPlayerSeat(id, 7, undefined)).toBe(false);
      });

      it("ignores names/credentials in boardgame.io's own metadata writes", async () => {
        const id = newID();
        await db.createMatch(id, { initialState: state(0), metadata: seated() });
        // e.g. boardgame.io wrote back a stale copy after we freed/reassigned a seat
        await db.setMetadata(
          id,
          metadata('tictactoe', {
            players: {
              0: { id: 0, name: 'Stale', credentials: 'stale-hash', isConnected: true },
              1: { id: 1, name: 'Ghost', credentials: 'ghost-hash', isConnected: false },
            },
            updatedAt: 5000,
            gameover: { winner: '0' },
          }),
        );
        const { metadata: stored } = await db.fetch(id, { metadata: true });
        expect(stored.players).toEqual({
          0: { id: 0, name: 'Alice', credentials: 'hash-a', isConnected: true },
          1: { id: 1, isConnected: false },
        });
        expect(stored.updatedAt).toBe(5000);
        expect(stored.gameover).toEqual({ winner: '0' });
      });
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
