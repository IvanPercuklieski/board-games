import { BreakpointObserver } from '@angular/cdk/layout';
import { NgTemplateOutlet } from '@angular/common';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
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
import { GameChatComponent } from '../../game-kit/game-chat.component';
import { ZoomPanComponent } from '../../game-kit/zoom-pan.component';
import { IconButtonComponent } from '../../ui/button/icon-button.component';
import { ButtonComponent } from '../../ui/button/button.component';
import type { GameBoard } from '../boards';
import { CatanDiceComponent } from './catan-dice.component';
import { CatanHandComponent, type CardPlay } from './catan-hand.component';
import { describeCounts } from './catan-labels';
import { CatanLogComponent } from './catan-log.component';
import { CatanMapComponent, type MapTargets } from './catan-map.component';
import { CatanOfferComponent } from './catan-offer.component';
import { CatanPlayersComponent } from './catan-players.component';
import { CatanTradeComponent, type BankTrade, type TradeOfferDraft } from './catan-trade.component';
import { situation, type Situation } from './catan-turn';
import { mapLayout } from './map-layout';
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
    GameChatComponent,
    IconButtonComponent,
    NgTemplateOutlet,
    ZoomPanComponent,
    CatanDiceComponent,
    CatanHandComponent,
    CatanLogComponent,
    CatanMapComponent,
    CatanOfferComponent,
    CatanPlayersComponent,
    CatanTradeComponent,
    ResourceCounterComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (G(); as G) {
      <div class="table">
        <section class="board-area" aria-label="Board">
          <div class="status">
            <p class="prompt" role="status">{{ prompt() }}</p>
            <bt-catan-dice [roll]="G.lastRoll" />
          </div>
          <bt-zoom-pan class="map-frame" label="Island map" [style.--map-ratio]="mapRatio()">
            <bt-catan-map [state]="G" [targets]="targets()" (picked)="pick($event)" />
          </bt-zoom-pan>

          @if (popout(); as kind) {
            <section
              #popout
              class="popout"
              tabindex="-1"
              [attr.aria-label]="kind === 'builder' ? 'Trade' : 'Trade offer'"
              (keydown.escape)="closeBuilder()"
            >
              @if (kind === 'builder') {
                <div class="popout-head">
                  <h2>Trade</h2>
                  <button
                    bt-icon-button
                    size="sm"
                    icon="x"
                    label="Close trade"
                    (click)="closeBuilder()"
                  ></button>
                </div>
                <bt-catan-trade
                  [state]="G"
                  [me]="me()"
                  (bankTrade)="bankTrade($event)"
                  (offer)="offer($event)"
                />
              } @else if (kind === 'trading') {
                <bt-catan-offer
                  [state]="G"
                  [me]="me()"
                  [owner]="currentPlayer()"
                  [players]="players()"
                  (confirm)="move('confirmTrade', $event)"
                  (acceptCounter)="move('acceptCounter', $event)"
                  (cancel)="move('cancelTrade')"
                />
              } @else {
                <bt-catan-offer
                  [state]="G"
                  [me]="me()"
                  [owner]="currentPlayer()"
                  [players]="players()"
                  (respond)="move('respondTrade', $event)"
                  (counter)="move('counterTrade', $event.give, $event.want)"
                />
              }
            </section>
          }
        </section>

        <section class="hand-area" aria-label="Your cards and actions">
          <bt-catan-hand
            [hand]="myHand()"
            [bank]="G.bank"
            [canPlay]="canPlayCard()"
            (play)="playCard($event)"
          />
          <div class="act">
            @switch (sit()?.kind) {
              @case ('roll') {
                <button bt-button size="lg" (click)="move('rollDice')">Roll the dice</button>
              }
              @case ('discard') {
                <div class="discard">
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
                  <div class="actions" role="group" aria-label="Take a card from">
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
                <ng-container *ngTemplateOutlet="buildButtons" />
                <div class="actions">
                  <button
                    #tradeButton
                    bt-button
                    variant="secondary"
                    [attr.aria-expanded]="tradeOpen()"
                    (click)="tradeOpen.set(!tradeOpen())"
                  >
                    Trade
                  </button>
                  <button bt-button (click)="move('endTurn')">End turn</button>
                </div>
              }
              @case ('specialBuild') {
                <ng-container *ngTemplateOutlet="buildButtons" />
                <div class="actions">
                  <button bt-button (click)="move('finishSpecialBuild')">Done building</button>
                </div>
              }
            }
          </div>
        </section>

        <aside class="side" aria-label="Table">
          @if (wide()) {
            <bt-catan-log class="pane" [state]="G" [me]="me()" [players]="players()" />
            <bt-catan-players [state]="G" [players]="players()" [stages]="stages()" />
            <bt-game-chat class="pane" [session]="session()" />
          } @else {
            <div class="tabs" role="tablist" aria-label="Table">
              @for (t of tabs; track t.id) {
                <button
                  type="button"
                  role="tab"
                  class="tab"
                  [id]="'catan-tab-' + t.id"
                  [attr.aria-selected]="tab() === t.id"
                  [attr.aria-controls]="'catan-panel-' + t.id"
                  [attr.tabindex]="tab() === t.id ? 0 : -1"
                  (click)="tab.set(t.id)"
                  (keydown)="tabKey($event)"
                >
                  {{ t.label }}
                </button>
              }
            </div>
            <div
              role="tabpanel"
              class="tab-panel"
              [id]="'catan-panel-' + tab()"
              [attr.aria-labelledby]="'catan-tab-' + tab()"
            >
              @switch (tab()) {
                @case ('players') {
                  <bt-catan-players [state]="G" [players]="players()" [stages]="stages()" />
                }
                @case ('log') {
                  <bt-catan-log [state]="G" [me]="me()" [players]="players()" />
                }
                @case ('chat') {
                  <bt-game-chat [session]="session()" />
                }
              }
            </div>
          }
          <p class="deck">{{ deckText() }}</p>
        </aside>
      </div>

      <ng-template #buildButtons>
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
          <button bt-button variant="secondary" [disabled]="!canBuyCard()" (click)="buyCard()">
            Card <span class="cost">{{ cardCost }}</span>
          </button>
        </div>
      </ng-template>
    }
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
    .table {
      position: relative;
      display: grid;
      gap: var(--bt-space-3);
    }
    .board-area {
      position: relative;
      display: grid;
      gap: var(--bt-space-2);
      min-width: 0;
    }
    .status {
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
    .popout {
      position: absolute;
      top: var(--bt-space-12);
      right: 0;
      left: 0;
      z-index: 5;
      display: grid;
      gap: var(--bt-space-3);
      max-height: 75vh;
      overflow: auto;
      padding: var(--bt-space-4);
      border: var(--bt-border-width) solid var(--bt-color-border);
      border-radius: var(--bt-radius-lg);
      background: var(--bt-color-surface-raised);
      box-shadow: var(--bt-shadow-lg);
    }
    .popout:focus-visible {
      outline: none;
      box-shadow: var(--bt-focus-ring), var(--bt-shadow-lg);
    }
    .popout-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .popout-head h2 {
      font-size: var(--bt-text-lg);
    }
    .hand-area {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--bt-space-3);
      padding: var(--bt-space-3);
      border: var(--bt-border-width) solid var(--bt-color-border);
      border-radius: var(--bt-radius-lg);
      background: var(--bt-color-surface);
    }
    bt-catan-hand {
      flex: 1 1 22rem;
      min-width: 0;
    }
    .act {
      display: grid;
      gap: var(--bt-space-2);
      justify-items: end;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--bt-space-2);
    }
    .discard {
      display: grid;
      gap: var(--bt-space-3);
      justify-items: start;
    }
    .cost {
      color: var(--bt-color-text-muted);
      font-size: var(--bt-text-xs);
      font-weight: 400;
    }
    .side {
      display: grid;
      gap: var(--bt-space-4);
      min-width: 0;
      min-height: 0;
    }
    .tabs {
      display: flex;
      gap: var(--bt-space-1);
      border-bottom: var(--bt-border-width) solid var(--bt-color-border);
    }
    .tab {
      padding: var(--bt-space-2) var(--bt-space-4);
      border: 0;
      border-bottom: 2px solid transparent;
      background: none;
      color: var(--bt-color-text-muted);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    .tab[aria-selected='true'] {
      border-bottom-color: var(--bt-color-accent);
      color: var(--bt-color-text);
    }
    .tab:focus-visible {
      outline: none;
      box-shadow: var(--bt-focus-ring);
    }
    .tab-panel bt-game-chat {
      height: 20rem;
    }
    .deck {
      color: var(--bt-color-text-muted);
      font-size: var(--bt-text-sm);
    }
    .map-frame {
      /* the zoom frame hugs the map, so the map takes its width from here */
      container-type: inline-size;
    }
    .map-frame ::ng-deep bt-catan-map {
      width: 100cqw;
    }

    /* Wide screens: board in the middle, cards and actions below, the table on the right. */
    @media (min-width: 64rem) {
      .table {
        grid-template-columns: minmax(0, 1fr) 22rem;
        grid-template-rows: minmax(0, 1fr) auto;
        grid-template-areas:
          'board side'
          'hand side';
        height: calc(100dvh - 4.5rem - var(--bt-space-6));
      }
      .board-area {
        grid-area: board;
        grid-template-rows: auto minmax(0, 1fr);
        min-height: 0;
      }
      .map-frame {
        /* as large as fits both ways, keeping the island's proportions */
        container-type: size;
        min-height: 0;
      }
      .map-frame ::ng-deep bt-catan-map {
        width: min(100cqw, calc(100cqh * var(--map-ratio)));
        margin: 0 auto;
      }
      .popout {
        top: 0;
        left: auto;
        width: min(24rem, 100%);
        max-height: 100%;
      }
      .hand-area {
        grid-area: hand;
      }
      .side {
        grid-area: side;
        grid-template-rows: minmax(0, 1fr) auto minmax(0, 1fr) auto;
        --bt-pane-max-height: none;
      }
      .pane {
        min-height: 0;
      }
    }
  `,
})
export class CatanBoardComponent implements GameBoard<CatanState> {
  readonly session = input.required<GameSession<CatanState>>();

  protected readonly G = computed(() => this.session().G());

  /** Wide screens show log, players and chat together; phones use tabs. */
  protected readonly wide = toSignal(
    inject(BreakpointObserver)
      .observe('(min-width: 64rem)')
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );
  protected readonly tabs = [
    { id: 'players', label: 'Players' },
    { id: 'log', label: 'Log' },
    { id: 'chat', label: 'Chat' },
  ] as const;
  protected readonly tab = signal<'players' | 'log' | 'chat'>('players');

  protected readonly mapRatio = computed(() => {
    const size = this.G()?.board.size;
    if (!size) return 1;
    const { width, height } = mapLayout(size);
    return width / height;
  });
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

  /** The floating trade panel: the builder (opened with Trade) or an open offer. */
  protected readonly popout = computed<'builder' | 'trading' | 'tradeResponse' | null>(() => {
    const kind = this.sitKind();
    if (kind === 'trading' || kind === 'tradeResponse') return kind;
    return kind === 'actions' && this.tradeOpen() ? 'builder' : null;
  });
  private readonly popoutEl = viewChild<ElementRef<HTMLElement>>('popout');
  private readonly tradeButton = viewChild('tradeButton', { read: ElementRef<HTMLElement> });

  constructor() {
    // A new pop-out takes the focus, so keyboard and screen reader users land in it.
    let shown: string | null = null;
    afterRenderEffect(() => {
      const kind = this.popout();
      if (kind && kind !== shown) this.popoutEl()?.nativeElement.focus();
      shown = kind;
    });
  }

  protected closeBuilder() {
    if (this.popout() !== 'builder') return;
    this.tradeOpen.set(false);
    this.tradeButton()?.nativeElement.focus();
  }

  /** Arrow keys move between the phone tabs (WAI-ARIA tabs pattern). */
  protected tabKey(event: KeyboardEvent) {
    const ids = this.tabs.map((t) => t.id);
    const at = ids.indexOf(this.tab());
    const next =
      event.key === 'ArrowRight'
        ? ids[(at + 1) % ids.length]
        : event.key === 'ArrowLeft'
          ? ids[(at - 1 + ids.length) % ids.length]
          : undefined;
    if (!next) return;
    event.preventDefault();
    this.tab.set(next);
    document.getElementById(`catan-tab-${next}`)?.focus();
  }

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
