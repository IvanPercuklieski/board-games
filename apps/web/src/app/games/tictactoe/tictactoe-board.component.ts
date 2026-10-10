import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { findWinningLine, type TicTacToeState } from '@board-table/games';
import type { GameSession } from '../../game-client/game-session';
import { PlacePieceDirective } from '../../game-kit/place-piece.directive';
import type { GameBoard } from '../boards';

const MARK: Record<string, 'X' | 'O'> = { '0': 'X', '1': 'O' };

interface CellView {
  index: number;
  owner: string | null;
  mark: 'X' | 'O' | null;
  winning: boolean;
  label: string;
}

/**
 * Tic-tac-toe board: nine real buttons (keyboard and screen-reader friendly) on a
 * hand-drawn grid. Player 0 is X, player 1 is O, each in their seat colour.
 */
@Component({
  selector: 'bt-tictactoe-board',
  imports: [PlacePieceDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="board" role="group" aria-label="Tic-tac-toe board">
      <svg class="lines" viewBox="0 0 300 300" aria-hidden="true" focusable="false">
        <path d="M101 14 C99 110 102 200 100 286" />
        <path d="M199 12 C201 112 198 196 201 288" />
        <path d="M14 101 C110 99 196 102 286 100" />
        <path d="M12 200 C112 202 194 198 288 201" />
      </svg>
      @for (cell of cells(); track cell.index) {
        <button
          type="button"
          class="cell"
          [class.winning]="cell.winning"
          [disabled]="!canPlay() || cell.owner !== null"
          [attr.aria-label]="cell.label"
          (click)="play(cell.index)"
        >
          @if (cell.mark === 'X') {
            <svg class="mark x" viewBox="0 0 100 100" aria-hidden="true" btPlacePiece>
              <path d="M24 24 L76 76 M76 24 L24 76" />
            </svg>
          } @else if (cell.mark === 'O') {
            <svg class="mark o" viewBox="0 0 100 100" aria-hidden="true" btPlacePiece>
              <circle cx="50" cy="50" r="27" />
            </svg>
          }
        </button>
      }
    </div>
    <p class="hint" aria-hidden="true">{{ hint() }}</p>
  `,
  styles: `
    :host {
      display: grid;
      justify-items: center;
      gap: var(--bt-space-4);
      width: min(26rem, 100%);
    }
    .board {
      position: relative;
      display: grid;
      /* three equal rows and columns, so cells line up with the drawn grid */
      grid-template: repeat(3, minmax(0, 1fr)) / repeat(3, minmax(0, 1fr));
      width: 100%;
      aspect-ratio: 1;
    }
    .lines {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
    .lines path {
      fill: none;
      stroke: var(--bt-color-border-strong);
      stroke-width: 5;
      stroke-linecap: round;
    }
    .cell {
      position: relative;
      display: grid;
      place-items: center;
      margin: 9%;
      padding: 0;
      border: 0;
      border-radius: var(--bt-radius-lg);
      background: transparent;
      cursor: pointer;
      transition: background-color var(--bt-duration-fast) var(--bt-ease-standard);
    }
    .cell:not(:disabled):hover {
      background: var(--bt-color-accent-subtle);
    }
    .cell:disabled {
      cursor: default;
    }
    .cell.winning {
      background: var(--bt-color-warning-subtle);
    }
    .mark {
      width: 78%;
      height: 78%;
      fill: none;
      stroke-width: 11;
      stroke-linecap: round;
    }
    .mark.x {
      stroke: var(--bt-color-seat-0);
    }
    .mark.o {
      stroke: var(--bt-color-seat-1);
    }
    .hint {
      min-height: 1.5em;
      color: var(--bt-color-text-muted);
      font-size: var(--bt-text-sm);
    }
  `,
})
export class TicTacToeBoardComponent implements GameBoard<TicTacToeState> {
  readonly session = input.required<GameSession<TicTacToeState>>();

  protected readonly canPlay = computed(() => this.session().isMyTurn());

  protected readonly cells = computed<CellView[]>(() => {
    const cells = this.session().G()?.cells ?? Array<string | null>(9).fill(null);
    const line = findWinningLine(cells);
    const names = new Map(
      this.session()
        .players()
        .map((p) => [p.playerID, p.name]),
    );
    return cells.map((owner, index) => {
      const mark = owner === null ? null : (MARK[owner] ?? null);
      const winning = line?.includes(index) ?? false;
      const where = `Row ${Math.floor(index / 3) + 1}, column ${(index % 3) + 1}`;
      const what = owner === null ? 'empty' : `${mark} (${names.get(owner) ?? 'player'})`;
      return {
        index,
        owner,
        mark,
        winning,
        label: `${where}: ${what}${winning ? ', winning line' : ''}`,
      };
    });
  });

  protected readonly hint = computed(() => {
    const session = this.session();
    if (session.gameover() !== undefined) return '';
    if (session.isMyTurn()) return 'Pick a square';
    const current = session.players().find((p) => p.isCurrent);
    return current ? `Waiting for ${current.name}…` : '';
  });

  protected play(index: number) {
    if (this.canPlay()) this.session().move('clickCell', index);
  }
}
