import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import {
  banditVictims,
  citySpots,
  COSTS,
  hasAll,
  roadSpots,
  settlementSpots,
  totalResources,
  type CatanState,
} from '@board-table/games';
import type { GameSession } from '../../game-client/game-session';
import { ButtonComponent } from '../../ui/button/button.component';
import type { GameBoard } from '../boards';
import { CatanDiceComponent } from './catan-dice.component';
import { CatanHandComponent, type CardPlay } from './catan-hand.component';
import { describeCounts } from './catan-labels';
import { CatanMapComponent, type MapTargets } from './catan-map.component';
import { CatanOfferComponent } from './catan-offer.component';
import { CatanPlayersComponent } from './catan-players.component';
import { CatanTradeComponent, type BankTrade, type TradeOfferDraft } from './catan-trade.component';
import { situation, type Situation } from './catan-turn';
import { noCounts, ResourceCounterComponent } from './resource-counter.component';

type BuildMode = 'road' | 'settlement' | 'city';

const BUILD: Record<BuildMode, { label: string; verb: string; cost: keyof typeof COSTS }> = {
  road: { label: 'Road', verb: 'Build a road', cost: 'road' },
  settlement: { label: 'Settlement', verb: 'Build a settlement', cost: 'settlement' },
  city: { label: 'City', verb: 'Upgrade to a city', cost: 'city' },
};

/**
 * Catan board: the island with the spots the player can pick, what to do now, their hand,
 * and everyone's standing. All rules live in the games package; this only shows legal choices
 * and sends moves.
 */
@Component({
  selector: 'bt-catan-board',
  imports: [
    ButtonComponent,
    CatanDiceComponent,
    CatanHandComponent,
    CatanMapComponent,
    CatanOfferComponent,
    CatanPlayersComponent,
    CatanTradeComponent,
    ResourceCounterComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (G(); as G) {
      <div class="layout">
        <div class="main">
          <div class="bar">
            <p class="prompt" role="status">{{ prompt() }}</p>
            <bt-catan-dice [roll]="G.lastRoll" />
          </div>

          <bt-catan-map [state]="G" [targets]="targets()" (picked)="pick($event)" />
        </div>

        <!-- next to the map on wide screens, under it on phones -->
        <div class="act">
          @switch (sit()?.kind) {
            @case ('roll') {
              <div class="panel actions">
                <button bt-button (click)="move('rollDice')">Roll the dice</button>
              </div>
            }
            @case ('discard') {
              <div class="panel">
                <bt-resource-counter
                  [label]="'Give back ' + discardCount() + ' cards'"
                  [max]="myHand().resources"
                  [(value)]="discardPick"
                />
                <button
                  bt-button
                  [disabled]="discardTotal() !== discardCount()"
                  (click)="move('discard', discardPick())"
                >
                  {{ discardLabel() }}
                </button>
              </div>
            }
            @case ('bandit') {
              @if (banditHex() !== null) {
                <div class="panel actions" role="group" aria-label="Take a card from">
                  @for (v of victims(); track v.playerID) {
                    <button bt-button variant="secondary" (click)="steal(v.playerID)">
                      Take a card from {{ v.name }} ({{ v.cards }})
                    </button>
                  }
                  <button bt-button variant="ghost" (click)="banditHex.set(null)">
                    Pick another land
                  </button>
                </div>
              }
            }
            @case ('actions') {
              <div class="panel">
                <div class="actions" role="group" aria-label="Build">
                  @for (b of builds(); track b.mode) {
                    <button
                      bt-button
                      variant="secondary"
                      [attr.aria-pressed]="mode() === b.mode"
                      [disabled]="!b.possible"
                      (click)="toggleMode(b.mode)"
                    >
                      {{ b.label }} <span class="cost">{{ b.cost }}</span>
                    </button>
                  }
                  <button
                    bt-button
                    variant="secondary"
                    [disabled]="!canBuyCard()"
                    (click)="buyCard()"
                  >
                    Card <span class="cost">{{ cardCost }}</span>
                  </button>
                </div>
                <div class="actions">
                  <button
                    bt-button
                    variant="secondary"
                    [attr.aria-expanded]="tradeOpen()"
                    (click)="tradeOpen.set(!tradeOpen())"
                  >
                    Trade
                  </button>
                  <button bt-button (click)="move('endTurn')">End turn</button>
                </div>
                @if (tradeOpen()) {
                  <bt-catan-trade
                    [state]="G"
                    [me]="me()"
                    (bankTrade)="bankTrade($event)"
                    (offer)="offer($event)"
                  />
                }
              </div>
            }
            @case ('specialBuild') {
              <div class="panel">
                <div class="actions" role="group" aria-label="Build">
                  @for (b of builds(); track b.mode) {
                    <button
                      bt-button
                      variant="secondary"
                      [attr.aria-pressed]="mode() === b.mode"
                      [disabled]="!b.possible"
                      (click)="toggleMode(b.mode)"
                    >
                      {{ b.label }} <span class="cost">{{ b.cost }}</span>
                    </button>
                  }
                  <button
                    bt-button
                    variant="secondary"
                    [disabled]="!canBuyCard()"
                    (click)="buyCard()"
                  >
                    Card <span class="cost">{{ cardCost }}</span>
                  </button>
                </div>
                <div class="actions">
                  <button bt-button (click)="move('finishSpecialBuild')">Done building</button>
                </div>
              </div>
            }
            @case ('trading') {
              <bt-catan-offer
                class="panel"
                [state]="G"
                [me]="me()"
                [owner]="currentPlayer()"
                [players]="players()"
                (confirm)="move('confirmTrade', $event)"
                (cancel)="move('cancelTrade')"
              />
            }
            @case ('tradeResponse') {
              <bt-catan-offer
                class="panel"
                [state]="G"
                [me]="me()"
                [owner]="currentPlayer()"
                [players]="players()"
                (respond)="move('respondTrade', $event)"
              />
            }
          }
        </div>

        <aside class="side" aria-label="Hand and players">
          <bt-catan-hand
            [hand]="myHand()"
            [bank]="G.bank"
            [canPlay]="canPlayCard()"
            (play)="playCard($event)"
          />
          <bt-catan-players [state]="G" [players]="players()" [stages]="stages()" />
          <p class="deck">{{ deckText() }}</p>
        </aside>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
    .layout {
      display: grid;
      gap: var(--bt-space-6);
      align-items: start;
    }
    @media (min-width: 64rem) {
      .layout {
        grid-template-columns: minmax(0, 1.7fr) minmax(18rem, 1fr);
        grid-template-rows: auto 1fr;
        grid-template-areas:
          'main act'
          'main side';
      }
      .main {
        grid-area: main;
      }
      .act {
        grid-area: act;
      }
      .side {
        grid-area: side;
      }
    }
    .main,
    .act,
    .side {
      display: grid;
      gap: var(--bt-space-4);
      min-width: 0;
    }
    .bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--bt-space-3);
    }
    .prompt {
      font-family: var(--bt-font-display);
      font-size: var(--bt-text-lg);
      font-weight: 560;
      min-height: 1.5em;
    }
    .panel {
      display: grid;
      gap: var(--bt-space-4);
      justify-items: start;
      padding: var(--bt-space-4);
      border: var(--bt-border-width) solid var(--bt-color-border);
      border-radius: var(--bt-radius-lg);
      background: var(--bt-color-surface);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--bt-space-2);
    }
    .panel.actions {
      display: flex;
    }
    .cost {
      color: var(--bt-color-text-muted);
      font-size: var(--bt-text-xs);
      font-weight: 400;
    }
    .deck {
      color: var(--bt-color-text-muted);
      font-size: var(--bt-text-sm);
    }
  `,
})
export class CatanBoardComponent implements GameBoard<CatanState> {
  readonly session = input.required<GameSession<CatanState>>();

  protected readonly G = computed(() => this.session().G());
  protected readonly me = computed(() => this.session().playerID);
  protected readonly players = computed(() => this.session().players());
  protected readonly currentPlayer = computed(() => this.session().ctx()?.currentPlayer ?? '');
  protected readonly stages = computed(
    () => (this.session().ctx()?.activePlayers as Record<string, string> | null) ?? null,
  );

  protected readonly sit = computed<Situation | null>(() => {
    const G = this.G();
    const ctx = this.session().ctx();
    if (!G || !ctx) return null;
    return situation(G, ctx, this.me(), this.session().isMyTurn(), (id) => this.nameOf(id));
  });

  /** Choices that only last while the situation stays the same. */
  private readonly sitKind = computed(() => this.sit()?.kind);
  protected readonly mode = linkedSignal<Situation['kind'] | undefined, BuildMode | null>({
    source: this.sitKind,
    computation: () => null,
  });
  protected readonly banditHex = linkedSignal<Situation['kind'] | undefined, number | null>({
    source: this.sitKind,
    computation: () => null,
  });
  protected readonly tradeOpen = linkedSignal({ source: this.sitKind, computation: () => false });
  protected readonly discardPick = linkedSignal({ source: this.sitKind, computation: noCounts });

  protected readonly myHand = computed(() => this.G()!.hands[this.me()]!);
  protected readonly discardCount = computed(() => {
    const s = this.sit();
    return s?.kind === 'discard' ? s.count : 0;
  });
  protected readonly discardTotal = computed(() => totalResources(this.discardPick()));
  protected readonly discardLabel = computed(() => {
    const missing = this.discardCount() - this.discardTotal();
    if (missing > 0) return `Pick ${missing} more`;
    if (missing < 0) return `Pick ${-missing} fewer`;
    return `Give back ${describeCounts(this.discardPick())}`;
  });

  protected readonly cardCost = costText('card');
  protected readonly builds = computed(() => {
    const G = this.G()!;
    const me = this.me();
    const supply = G.players[me]!;
    const left: Record<BuildMode, number> = {
      road: supply.roads,
      settlement: supply.settlements,
      city: supply.cities,
    };
    return (Object.keys(BUILD) as BuildMode[]).map((mode) => ({
      mode,
      label: BUILD[mode].label,
      cost: costText(BUILD[mode].cost),
      possible:
        left[mode] > 0 &&
        hasAll(this.myHand().resources, COSTS[BUILD[mode].cost]) &&
        this.spots(mode).length > 0,
    }));
  });

  protected readonly canBuyCard = computed(
    () =>
      (this.G()!.counts?.deckSize ?? this.G()!.secret.devDeck.length) > 0 &&
      hasAll(this.myHand().resources, COSTS.card),
  );

  protected readonly canPlayCard = computed(() => {
    const kind = this.sit()?.kind;
    return (kind === 'roll' || kind === 'actions') && !this.G()!.turn.cardPlayed;
  });

  protected readonly victims = computed(() => {
    const hex = this.banditHex();
    const G = this.G();
    if (hex === null || !G) return [];
    return this.victimsAt(G, hex).map((playerID) => ({
      playerID,
      name: this.nameOf(playerID),
      cards: G.counts?.handSizes[playerID]?.resources ?? 0,
    }));
  });

  protected readonly targets = computed<MapTargets | null>(() => {
    const s = this.sit();
    const G = this.G();
    if (!s || !G) return null;
    const me = this.me();
    switch (s.kind) {
      case 'setupSettlement':
        return { kind: 'vertex', ids: settlementSpots(G, me, false), verb: 'Place a settlement' };
      case 'setupRoad':
        return { kind: 'edge', ids: roadSpots(G, me, G.setupSettlement), verb: 'Place a road' };
      case 'bandit':
        if (this.banditHex() !== null) return null;
        return {
          kind: 'hex',
          ids: G.board.hexes.flatMap((_, i) => (i === G.bandit ? [] : [i])),
          verb: 'Move the Bandit',
        };
      case 'roadCrew':
        return { kind: 'edge', ids: roadSpots(G, me), verb: 'Place a free road' };
      case 'actions':
      case 'specialBuild': {
        const mode = this.mode();
        if (!mode) return null;
        return {
          kind: mode === 'road' ? 'edge' : 'vertex',
          ids: this.spots(mode),
          verb: BUILD[mode].verb,
        };
      }
      default:
        return null;
    }
  });

  protected readonly prompt = computed(() => {
    const s = this.sit();
    if (!s) return '';
    switch (s.kind) {
      case 'setupSettlement':
        return s.second
          ? 'Place your second settlement. It collects a card from each land around it.'
          : 'Place your first settlement on a free corner, two sides away from others.';
      case 'setupRoad':
        return 'Place a road next to your new settlement.';
      case 'roll':
        return 'Your turn. Roll the dice, or play a card first.';
      case 'discard':
        return `A seven! Give back ${s.count} of your cards.`;
      case 'bandit':
        return this.banditHex() === null
          ? 'Move the Bandit to another land.'
          : 'Take a card from whom?';
      case 'actions':
        return this.mode()
          ? `Pick a spot for your ${BUILD[this.mode()!].label.toLowerCase()}.`
          : 'Build, trade or play a card. End your turn when you’re done.';
      case 'roadCrew':
        return `Place a free road (${s.left} left).`;
      case 'trading':
        return 'Waiting for answers to your offer.';
      case 'tradeResponse':
        return `${this.nameOf(this.currentPlayer())} wants to trade.`;
      case 'specialBuild':
        return this.mode()
          ? `Pick a spot for your ${BUILD[this.mode()!].label.toLowerCase()}.`
          : 'Your chance to build before the next turn.';
      case 'waiting':
        return `${s.text}…`;
      case 'over':
        return '';
    }
  });

  protected readonly deckText = computed(() => {
    const size = this.G()?.counts?.deckSize;
    return size === undefined ? '' : `${size} development cards left in the deck.`;
  });

  protected move(name: string, ...args: unknown[]) {
    this.session().move(name, ...args);
  }

  protected toggleMode(mode: BuildMode) {
    this.mode.set(this.mode() === mode ? null : mode);
  }

  protected buyCard() {
    this.move('buyCard');
  }

  protected bankTrade({ give, get }: BankTrade) {
    this.move('bankTrade', give, get);
  }

  protected offer({ give, want }: TradeOfferDraft) {
    this.move('offerTrade', give, want);
  }

  protected playCard(play: CardPlay) {
    switch (play.card) {
      case 'guard':
        return this.move('playGuard');
      case 'roadCrew':
        return this.move('playRoadCrew');
      case 'windfall':
        return this.move('playWindfall', ...play.resources);
      case 'market':
        return this.move('playMarket', play.resource);
    }
  }

  protected pick(id: number) {
    const s = this.sit();
    const G = this.G();
    if (!s || !G) return;
    switch (s.kind) {
      case 'setupSettlement':
        return this.move('placeSettlement', id);
      case 'setupRoad':
        return this.move('placeRoad', id);
      case 'roadCrew':
        return this.move('placeFreeRoad', id);
      case 'bandit': {
        const victims = this.victimsAt(G, id);
        if (victims.length > 1) return this.banditHex.set(id);
        return this.move('moveBandit', id, ...victims);
      }
      case 'actions':
      case 'specialBuild': {
        const mode = this.mode();
        if (!mode) return;
        this.mode.set(null);
        const name = { road: 'buildRoad', settlement: 'buildSettlement', city: 'buildCity' }[mode];
        return this.move(name, id);
      }
      default:
        return;
    }
  }

  protected steal(victim: string) {
    const hex = this.banditHex();
    if (hex !== null) this.move('moveBandit', hex, victim);
  }

  private spots(mode: BuildMode): number[] {
    const G = this.G()!;
    const me = this.me();
    if (mode === 'road') return roadSpots(G, me);
    if (mode === 'settlement') return settlementSpots(G, me, true);
    return citySpots(G, me);
  }

  /** Other players' hands are hidden in this view; their sizes are known. */
  private victimsAt(G: CatanState, hex: number): string[] {
    return banditVictims(G, hex, this.me(), (id) => G.counts?.handSizes[id]?.resources ?? 0);
  }

  private nameOf(playerID: string): string {
    return (
      this.players().find((p) => p.playerID === playerID)?.name ?? `Player ${Number(playerID) + 1}`
    );
  }
}

function costText(cost: keyof typeof COSTS): string {
  return describeCounts(COSTS[cost]);
}
