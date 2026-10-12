import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  POINTS_TO_WIN,
  publicPoints,
  totalResources,
  trailLength,
  victoryPoints,
  type CatanState,
} from '@board-table/games';
import type { SessionPlayer } from '../../game-client/game-session';
import { BadgeComponent } from '../../ui/badge/badge.component';
import { SeatTokenComponent } from '../../ui/seat-token/seat-token.component';

/** Everyone at the table: points, cards in hand, Guards played, awards, and who is acting. */
@Component({
  selector: 'bt-catan-players',
  imports: [BadgeComponent, SeatTokenComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 class="title">
      Players <span class="goal">first to {{ goal }} points</span>
    </h2>
    <ul>
      @for (p of rows(); track p.playerID) {
        <li [class.current]="p.isCurrent" [attr.aria-current]="p.isCurrent ? 'true' : null">
          <bt-seat-token [seatIndex]="p.seatIndex" [name]="p.name" [isYou]="p.isYou" />
          <div class="who">
            <span class="name">{{ p.name }}{{ p.isYou ? ' (you)' : '' }}</span>
            <span class="stats">
              {{ p.cards }} {{ p.cards === 1 ? 'card' : 'cards' }} · {{ p.devCards }} development ·
              {{ p.guards }} {{ p.guards === 1 ? 'Guard' : 'Guards' }} · trail {{ p.trail }}
            </span>
            <span class="badges">
              @if (p.longestTrail) {
                <bt-badge tone="accent">Longest Trail</bt-badge>
              }
              @if (p.strongestGuard) {
                <bt-badge tone="accent">Strongest Guard</bt-badge>
              }
              @if (p.status) {
                <bt-badge tone="warning">{{ p.status }}</bt-badge>
              }
            </span>
          </div>
          <span class="points" [attr.aria-label]="p.pointsLabel">
            {{ p.points }}
            @if (p.hidden > 0) {
              <span class="hidden">+{{ p.hidden }}</span>
            }
          </span>
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--bt-space-3);
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
      gap: var(--bt-space-2);
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
      border-radius: var(--bt-radius-md);
      border: var(--bt-border-width) solid transparent;
    }
    li.current {
      border-color: var(--bt-color-border-strong);
      background: var(--bt-color-surface-raised);
    }
    .who {
      display: grid;
      gap: 2px;
      min-width: 0;
    }
    .name {
      font-weight: 600;
    }
    .stats {
      color: var(--bt-color-text-muted);
      font-size: var(--bt-text-xs);
    }
    .badges {
      display: flex;
      flex-wrap: wrap;
      gap: var(--bt-space-1);
    }
    .badges:empty {
      display: none;
    }
    .points {
      font-family: var(--bt-font-display);
      font-size: var(--bt-text-2xl);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .hidden {
      color: var(--bt-color-text-muted);
      font-size: var(--bt-text-sm);
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
        guards: G.players[id]!.guards,
        trail: trailLength(G, id),
        longestTrail: G.awards.longestTrail === id,
        strongestGuard: G.awards.strongestGuard === id,
        points,
        hidden,
        pointsLabel:
          `${points} ${points === 1 ? 'point' : 'points'}` +
          (hidden > 0 ? `, plus ${hidden} hidden from Landmarks` : ''),
        status: statusOf(G, id, this.stages()?.[id]),
      };
    });
  });
}

function statusOf(G: CatanState, playerID: string, stage: string | undefined): string | null {
  if (stage === 'discard') return `Giving back ${G.turn.discards[playerID] ?? 0}`;
  if (stage === 'specialBuild') return 'Building';
  if (stage === 'tradeResponse' && G.turn.trade) {
    const answer = G.turn.trade.responses[playerID];
    return answer === undefined ? 'Thinking' : answer ? 'Accepts' : 'Declines';
  }
  return null;
}
