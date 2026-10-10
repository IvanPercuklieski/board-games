import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { gameCatalog, type GameCatalogEntry } from '@board-table/games/catalog';
import { LIMITS, type RoomSummary } from '@board-table/shared';
import { firstValueFrom } from 'rxjs';
import { ApiClient, ApiError } from '../../core/api-client';
import { ButtonComponent } from '../../ui/button/button.component';
import { SegmentedComponent } from '../../ui/segmented/segmented.component';
import { ToastService } from '../../ui/toast/toast.service';

export interface ChangeGameData {
  roomId: string;
  gameId: string;
  maxSeats: number;
  /** Players seated right now; every new game must fit them. */
  seated: number;
  /** Defaults to the full catalog; tests pass games with other player ranges. */
  games?: readonly GameCatalogEntry[];
}

export interface GameChoice {
  game: GameCatalogEntry;
  /** Why the game can't be chosen, or null if it can. */
  disabledReason: string | null;
}

/** Every game, with the ones that can't seat everyone disabled and explained. */
export function gameChoices(games: readonly GameCatalogEntry[], seated: number): GameChoice[] {
  return games.map((game) => ({
    game,
    disabledReason:
      game.maxPlayers < seated
        ? `Needs at most ${players(game.maxPlayers)}; ${seated} are seated`
        : null,
  }));
}

/** Seat counts the room can have with this game, keeping everyone who is seated. */
export function seatChoices(game: GameCatalogEntry, seated: number): number[] {
  const min = Math.max(game.minPlayers, seated);
  const max = Math.min(game.maxPlayers, LIMITS.maxSeats);
  return Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i);
}

/** Opens the dialog; resolves with the updated room, or undefined if nothing changed. */
export async function openChangeGameDialog(
  dialog: Dialog,
  data: ChangeGameData,
): Promise<RoomSummary | undefined> {
  const ref = dialog.open<RoomSummary | undefined, ChangeGameData>(ChangeGameDialogComponent, {
    data,
    // our component carries role/aria itself; the CDK container stays neutral
    role: 'dialog',
    ariaModal: false,
    backdropClass: 'bt-dialog-backdrop',
    autoFocus: 'first-tabbable',
    restoreFocus: true,
  });
  return firstValueFrom(ref.closed);
}

const players = (n: number) => (n === 1 ? '1 player' : `${n} players`);

let nextId = 0;

/** The host picks another game (and seat count) for a waiting room. */
@Component({
  selector: 'bt-change-game-dialog',
  imports: [ButtonComponent, SegmentedComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'dialog',
    'aria-modal': 'true',
    '[attr.aria-labelledby]': 'titleId',
  },
  template: `
    <h2 class="title" [id]="titleId">Change game</h2>
    <fieldset class="games" role="radiogroup" aria-label="Game">
      <legend class="bt-visually-hidden">Game</legend>
      @for (choice of choices; track choice.game.id) {
        <label
          class="game"
          [class.checked]="choice.game.id === gameId()"
          [class.disabled]="choice.disabledReason"
        >
          <input
            type="radio"
            class="bt-visually-hidden"
            [name]="name"
            [checked]="choice.game.id === gameId()"
            [disabled]="choice.disabledReason !== null"
            [attr.aria-describedby]="choice.disabledReason ? reasonId(choice) : null"
            (change)="choose(choice.game)"
          />
          <span class="game-name">{{ choice.game.displayName }}</span>
          <span class="muted">{{ range(choice.game) }}</span>
          @if (choice.disabledReason; as reason) {
            <span class="reason" [id]="reasonId(choice)">{{ reason }}</span>
          }
        </label>
      }
    </fieldset>
    @if (seatOptions().length > 1) {
      <div class="seats">
        <span class="label">Seats</span>
        <bt-segmented
          label="Seats"
          [options]="seatOptions()"
          [value]="maxSeats()"
          (valueChange)="maxSeats.set($event!)"
        />
      </div>
    }
    <div class="actions">
      <button bt-button variant="ghost" (click)="ref.close(undefined)">Cancel</button>
      <button bt-button [loading]="busy()" (click)="save()">Save</button>
    </div>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--bt-space-4);
      width: min(30rem, calc(100vw - 2 * var(--bt-space-4)));
      max-height: calc(100vh - 2 * var(--bt-space-8));
      overflow: auto;
      padding: var(--bt-space-6);
      border: var(--bt-border-width) solid var(--bt-color-border);
      border-radius: var(--bt-radius-lg);
      background: var(--bt-color-surface-raised);
      box-shadow: var(--bt-shadow-lg);
    }
    .title {
      font-size: var(--bt-text-xl);
    }
    .games {
      display: grid;
      gap: var(--bt-space-2);
      margin: 0;
      padding: 0;
      border: 0;
    }
    .game {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: var(--bt-space-1) var(--bt-space-3);
      padding: var(--bt-space-3) var(--bt-space-4);
      border: var(--bt-border-width) solid var(--bt-color-border);
      border-radius: var(--bt-radius-md);
      background: var(--bt-color-surface);
      cursor: pointer;
    }
    .game.checked {
      border-color: var(--bt-color-accent);
      box-shadow: inset 0 0 0 1px var(--bt-color-accent);
    }
    .game.disabled {
      cursor: not-allowed;
      background: var(--bt-color-surface-sunken);
    }
    .game:has(input:focus-visible) {
      box-shadow: var(--bt-focus-ring);
    }
    .game-name {
      font-family: var(--bt-font-display);
      font-weight: 600;
    }
    .muted {
      color: var(--bt-color-text-muted);
      font-size: var(--bt-text-sm);
    }
    .reason {
      grid-column: 1 / -1;
      color: var(--bt-color-text-muted);
      font-size: var(--bt-text-sm);
    }
    .seats {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--bt-space-3);
    }
    .label {
      font-weight: 600;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--bt-space-2);
    }
  `,
})
export class ChangeGameDialogComponent {
  private readonly data = inject<ChangeGameData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<RoomSummary | undefined>>(DialogRef);
  private readonly api = inject(ApiClient);
  private readonly toasts = inject(ToastService);

  private readonly id = nextId++;
  protected readonly titleId = `bt-change-game-title-${this.id}`;
  protected readonly name = `bt-change-game-${this.id}`;
  protected readonly choices = gameChoices(this.data.games ?? gameCatalog, this.data.seated);

  protected readonly gameId = signal(this.data.gameId);
  protected readonly maxSeats = signal(this.data.maxSeats);
  protected readonly busy = signal(false);

  private readonly game = computed(
    () => this.choices.find((c) => c.game.id === this.gameId())?.game,
  );
  protected readonly seatOptions = computed(() => {
    const game = this.game();
    return game
      ? seatChoices(game, this.data.seated).map((n) => ({ value: n, label: String(n) }))
      : [];
  });

  protected range(game: GameCatalogEntry) {
    return game.minPlayers === game.maxPlayers
      ? players(game.minPlayers)
      : `${game.minPlayers}–${game.maxPlayers} players`;
  }

  protected reasonId(choice: GameChoice) {
    return `${this.name}-${choice.game.id}-reason`;
  }

  protected choose(game: GameCatalogEntry) {
    this.gameId.set(game.id);
    const options = seatChoices(game, this.data.seated);
    // keep the seat count if the new game allows it, else the smallest that fits everyone
    if (!options.includes(this.maxSeats())) this.maxSeats.set(options[0] ?? this.data.seated);
  }

  protected async save() {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const room = await this.api.updateRoom(this.data.roomId, {
        gameId: this.gameId(),
        maxSeats: this.maxSeats(),
      });
      this.ref.close(room);
    } catch (e) {
      this.toasts.show({ message: failureMessage(e), tone: 'danger' });
    } finally {
      this.busy.set(false);
    }
  }
}

function failureMessage(e: unknown): string {
  if (!(e instanceof ApiError)) return 'The game couldn’t be changed. Try again.';
  switch (e.code) {
    case 'too_many_players':
      return 'Too many players are seated for that game. Free a seat first.';
    case 'room_locked':
      return 'The game has already started.';
    default:
      return 'The game couldn’t be changed. Try again.';
  }
}
