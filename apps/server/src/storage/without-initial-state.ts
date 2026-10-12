import type { LogEntry, Server, State, StorageAPI } from 'boardgame.io';
import { Async } from 'boardgame.io/internal';
import type { GameStorage, MatchSeat } from './game-storage';

/**
 * The storage boardgame.io reads through, minus the match's initial state.
 *
 * boardgame.io 0.50 answers every `sync` with `{ state, log, initialState }` and applies the
 * game's `playerView` to `state` and `log` only. `initialState` goes out unfiltered, so a game
 * with secrets leaks them (Catan: the shuffled development deck) along with the random seed
 * (all future dice and steals). Only `sync` asks for it, and the client keeps it just for
 * debugging tools (`getInitialState()`), so boardgame.io simply never gets it.
 * Covered by without-initial-state.spec.ts and catan-hidden-info.spec.ts.
 */
export class WithoutInitialState extends Async implements GameStorage {
  constructor(private readonly inner: GameStorage) {
    super();
  }

  connect() {
    return this.inner.connect();
  }

  override createMatch(matchID: string, opts: StorageAPI.CreateMatchOpts) {
    return this.inner.createMatch(matchID, opts);
  }

  setState(matchID: string, state: State, deltalog?: LogEntry[]) {
    return this.inner.setState(matchID, state, deltalog);
  }

  setMetadata(matchID: string, metadata: Server.MatchData) {
    return this.inner.setMetadata(matchID, metadata);
  }

  async fetch<O extends StorageAPI.FetchOpts>(matchID: string, opts: O) {
    const { initialState: _dropped, ...rest } = opts;
    const result: Partial<StorageAPI.FetchFields> = await this.inner.fetch(matchID, rest);
    // The result type still promises `initialState` when asked; boardgame.io handles it missing.
    return result as StorageAPI.FetchResult<O>;
  }

  wipe(matchID: string) {
    return this.inner.wipe(matchID);
  }

  override listMatches(opts?: StorageAPI.ListMatchesOpts) {
    return this.inner.listMatches(opts);
  }

  setPlayerSeat(matchID: string, playerID: number, seat: MatchSeat | undefined) {
    return this.inner.setPlayerSeat(matchID, playerID, seat);
  }
}
