import { computed, signal } from '@angular/core';
import type { Ctx, Game } from 'boardgame.io';
import { Client } from 'boardgame.io/client';

type ClientOptions = Parameters<typeof Client>[0];
type BgioClient = ReturnType<typeof Client>;
type ClientState = NonNullable<ReturnType<BgioClient['getState']>>;

export interface SessionPlayer {
  playerID: string;
  seatIndex: number;
  name: string;
  isYou: boolean;
  isCurrent: boolean;
  /** Known only with a real server (boardgame.io match data). */
  isConnected?: boolean;
}

export interface GameSessionOptions<G> {
  game: Game<G>;
  matchID: string;
  playerID: string;
  credentials: string;
  /** boardgame.io transport, e.g. SocketIO({ server }) or Local() in tests. */
  multiplayer: NonNullable<ClientOptions['multiplayer']>;
  /** Seat names by playerID index, used until the server's match data arrives. */
  playerNames?: readonly string[];
}

/**
 * One player's connection to a running match, as signals for the board UI.
 *
 * Subscribes to the boardgame.io client exactly once: in boardgame.io 0.50 subscribing again
 * after an unsubscribe can reuse a listener id and silently drop updates.
 * The owner must call stop() (e.g. from DestroyRef) to close the socket.
 */
export class GameSession<G> {
  private readonly client: BgioClient;
  private readonly playerNames: readonly string[];
  private readonly state = signal<ClientState | null>(null);
  private readonly matchData = signal<BgioClient['matchData']>(undefined);
  private unsubscribe: (() => void) | undefined;
  private stopped = false;

  readonly playerID: string;
  readonly G = computed(() => this.state()?.G as G | undefined);
  readonly ctx = computed<Ctx | undefined>(() => this.state()?.ctx);
  readonly isConnected = computed(() => this.state()?.isConnected ?? false);
  readonly currentPlayer = computed(() => this.ctx()?.currentPlayer);
  readonly gameover = computed(() => this.ctx()?.gameover as unknown);
  readonly isMyTurn = computed(() => {
    const state = this.state();
    return !!state && state.ctx.gameover === undefined && state.isActive;
  });

  readonly players = computed<SessionPlayer[]>(() => {
    const ctx = this.ctx();
    if (!ctx) return [];
    const data = this.matchData();
    return ctx.playOrder.map((playerID) => {
      const seatIndex = Number(playerID);
      const meta = data?.find((p) => p.id === seatIndex);
      return {
        playerID,
        seatIndex,
        name: meta?.name ?? this.playerNames[seatIndex] ?? `Player ${seatIndex + 1}`,
        isYou: playerID === this.playerID,
        isCurrent: ctx.gameover === undefined && playerID === ctx.currentPlayer,
        isConnected: meta?.isConnected,
      };
    });
  });

  constructor(options: GameSessionOptions<G>) {
    this.playerID = options.playerID;
    this.playerNames = options.playerNames ?? [];
    this.client = Client({
      game: options.game,
      multiplayer: options.multiplayer,
      matchID: options.matchID,
      playerID: options.playerID,
      credentials: options.credentials,
      debug: false,
    });
  }

  start() {
    if (this.unsubscribe || this.stopped) return;
    this.unsubscribe = this.client.subscribe((state) => {
      if (this.stopped) return;
      this.state.set(state);
      this.matchData.set(this.client.matchData);
    });
    this.client.start();
  }

  /** Makes a move if it exists; the game rules (client and server) decide if it is legal. */
  move(name: string, ...args: unknown[]) {
    if (this.stopped) return;
    this.client.moves[name]?.(...args);
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.unsubscribe?.();
    this.client.stop();
  }
}
