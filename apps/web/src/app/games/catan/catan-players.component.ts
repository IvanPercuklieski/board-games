import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  POINTS_TO_WIN,
  publicPoints,
  totalResources,
  victoryPoints,
  type CatanState,
} from '@board-table/games';
import type { SessionPlayer } from '../../game-client/game-session';
import { BadgeComponent } from '../../ui/badge/badge.component';
import { SeatTokenComponent } from '../../ui/seat-token/seat-token.component';

/** Pieces each player starts with (roads built = this minus the roads left). */
const ROADS = 15;

/** Original award marks: a winding trail and a shield. */
const AWARD_ICON = {
  longestTrail: 'M5 20c3-1 3-4 6-5s5-2 5-5 3-4 4-5 M4 20h3',
  strongestGuard: 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z M9 12l2 2 4-4',
} as const;

/**
 * Everyone at the table: whose turn it is, points, cards in hand (only how many for others),
 * development cards, roads built, Guards played, and the two awards, lit for their holder.
 */
@Component({
  selector: 'bt-catan-players',
  imports: [BadgeComponent, SeatTokenComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 class="title">
      Players <span class="goal">first to {{ goal }} points</span>
    </h2>
    <ul aria-label="Players">
      @for (p of rows(); track p.playerID) {
        <li [class.current]="p.isCurrent" [attr.aria-current]="p.isCurrent ? 'true' : null">
          <bt-seat-token [seatIndex]="p.seatIndex" [name]="p.name" [isYou]="p.isYou" />
          <div class="who">
            <span class="name">
              {{ p.name }}{{ p.isYou ? ' (you)' : '' }}
              @if (p.isCurrent) {
                <span class="turn">Turn</span>
              }
            </span>
            <dl class="stats">
              <div>
                <dt>Cards</dt>
                <dd>{{ p.cards }}</dd>
              </div>
              <div>
                <dt>Dev</dt>
                <dd>{{ p.devCards }}</dd>
              </div>
              <div>
                <dt>Roads</dt>
                <dd>{{ p.roads }}</dd>
              </div>
              <div>
                <dt>Guards</dt>
                <dd>{{ p.guards }}</dd>
              </div>
            </dl>
            @if (p.status) {
              <bt-badge tone="warning">{{ p.status }}</bt-badge>
            }
          </div>
          <div class="side">
            <span class="points" [attr.aria-label]="p.pointsLabel">
              {{ p.points }}
              @if (p.hidden > 0) {
                <span class="hidden">+{{ p.hidden }}</span>
              }
            </span>
            <span class="awards">
              @for (a of p.awards; track a.key) {
                <span
                  class="award"
                  [class.lit]="a.held"
                  role="img"
                  [attr.aria-label]="a.held ? 'Holds ' + a.name : a.name + ': not held'"
                  [attr.title]="a.name"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="a.icon" /></svg>
                </span>
              }
            </span>
          </div>
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--bt-space-2);
    }
    .title {
      font-size: var(--bt-text-lg);
    }
    .goal {
      margin-left: var(--bt-space-2);
      color: var(--bt-color-text-muted);
      font-family: var(--bt-font-sans);
      font-size: var(--bt-text-sm);
      font-weight: 400;
    }
    ul {
      display: grid;
      gap: var(--bt-space-1);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: var(--bt-space-3);
      padding: var(--bt-space-2) var(--bt-space-3);
      border: var(--bt-border-width) solid transparent;
      border-radius: var(--bt-radius-md);
    }
    li.current {
      border-color: var(--bt-color-accent);
      background: var(--bt-color-surface-raised);
      box-shadow: inset 3px 0 0 var(--bt-color-accent);
    }
    .who {
      display: grid;
      gap: 2px;
      justify-items: start;
      min-width: 0;
    }
    .name {
      font-weight: 600;
    }
    .turn {
      margin-left: var(--bt-space-1);
      padding: 0 var(--bt-space-1);
      border-radius: var(--bt-radius-sm);
      background: var(--bt-color-accent);
      color: var(--bt-color-on-accent);
      font-size: var(--bt-text-xs);
    }
    .stats {
      display: flex;
      flex-wrap: wrap;
      gap: 0 var(--bt-space-3);
      margin: 0;
      font-size: var(--bt-text-xs);
    }
    .stats div {
      display: flex;
      gap: var(--bt-space-1);
    }
    dt {
      color: var(--bt-color-text-muted);
    }
    dd {
      margin: 0;
      font-family: var(--bt-font-mono);
      font-weight: 600;
    }
    .side {
      display: grid;
      justify-items: end;
      gap: var(--bt-space-1);
    }
    .points {
      font-family: var(--bt-font-display);
      font-size: var(--bt-text-2xl);
      font-weight: 600;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }
    .hidden {
      color: var(--bt-color-text-muted);
      font-size: var(--bt-text-sm);
    }
    .awards {
      display: flex;
      gap: var(--bt-space-1);
    }
    .award {
      display: grid;
      place-items: center;
      width: 1.5rem;
      height: 1.5rem;
      border-radius: 50%;
      color: var(--bt-color-border-strong);
      opacity: 0.45;
      transition:
        opacity var(--bt-duration-base) var(--bt-ease-standard),
        box-shadow var(--bt-duration-base) var(--bt-ease-standard);
    }
    .award svg {
      width: 1rem;
      height: 1rem;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .award.lit {
      opacity: 1;
      background: var(--bt-color-accent);
      color: var(--bt-color-on-accent);
      box-shadow:
        0 0 0 2px var(--bt-color-accent-subtle),
        0 0 12px var(--bt-color-accent);
    }
  `,
})
export class CatanPlayersComponent {
  readonly state = input.required<CatanState>();
  readonly players = input.required<readonly SessionPlayer[]>();
  /** Stage per playerID (`ctx.activePlayers`), to show who is discarding or answering. */
  readonly stages = input<Record<string, string> | null>(null);

  protected readonly goal = POINTS_TO_WIN;

  protected readonly rows = computed(() => {
    const G = this.state();
    return this.players().map((p) => {
      const id = p.playerID;
      const size = G.counts?.handSizes[id];
      const hand = G.hands[id]!;
      const points = publicPoints(G, id);
      const hidden = p.isYou ? victoryPoints(G, id) - points : 0;
      return {
        ...p,
        cards: size?.resources ?? totalResources(hand.resources),
        devCards: size?.cards ?? hand.cards.length + hand.newCards.length,
        roads: ROADS - G.players[id]!.roads,
        guards: G.players[id]!.guards,
        points,
        hidden,
        pointsLabel:
          `${points} ${points === 1 ? 'point' : 'points'}` +
          (hidden > 0 ? `, plus ${hidden} hidden from Landmarks` : ''),
        awards: [
          {
            key: 'longestTrail',
            name: 'Longest Trail',
            icon: AWARD_ICON.longestTrail,
            held: G.awards.longestTrail === id,
          },
          {
            key: 'strongestGuard',
            name: 'Strongest Guard',
            icon: AWARD_ICON.strongestGuard,
            held: G.awards.strongestGuard === id,
          },
        ],
        status: statusOf(G, id, this.stages()?.[id]),
      };
    });
  });
}

function statusOf(G: CatanState, playerID: string, stage: string | undefined): string | null {
  if (stage === 'discard') return `Giving back ${G.turn.discards[playerID] ?? 0}`;
  if (stage === 'specialBuild') return 'Building';
  if (stage === 'tradeResponse' && G.turn.trade) {
    if (G.turn.trade.counters[playerID]) return 'Suggests other terms';
    const answer = G.turn.trade.responses[playerID];
    return answer === undefined ? 'Thinking' : answer ? 'Accepts' : 'Declines';
  }
  return null;
}
