import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

const SEAT_COLORS = 8;

/**
 * A player's place at the table: initials inside a ring in the seat's colour.
 * Free seats show a dashed ring; a player who is away (no live connection) is muted with a
 * clock. Announced as e.g. "Seat 2: Bob (you)".
 */
@Component({
  selector: 'bt-seat-token',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.--bt-seat-color]': '"var(--bt-color-seat-" + colorIndex() + ")"',
    '[class.free]': '!name()',
    '[class.you]': 'isYou()',
    '[class.away]': 'away() && !!name()',
    role: 'img',
    '[attr.aria-label]': 'description()',
  },
  template: `
    <span class="initials" aria-hidden="true">{{ initials() }}</span>
    @if (isHost()) {
      <span class="host" aria-hidden="true"><bt-icon name="crown" /></span>
    }
    @if (away() && name()) {
      <span class="away-mark" aria-hidden="true"><bt-icon name="clock" /></span>
    }
  `,
  styles: `
    :host {
      --_size: 2.75rem;
      position: relative;
      display: inline-grid;
      place-items: center;
      width: var(--_size);
      height: var(--_size);
      flex: none;
      border: 3px solid var(--bt-seat-color);
      border-radius: 50%;
      background: var(--bt-color-surface-raised);
      color: var(--bt-color-text);
      font-family: var(--bt-font-display);
      font-weight: 600;
      font-size: var(--bt-text-base);
    }
    :host(.free) {
      border-style: dashed;
      border-color: var(--bt-color-border-strong);
      background: transparent;
      color: var(--bt-color-text-muted);
    }
    :host(.away) {
      border-color: var(--bt-color-border-strong);
      color: var(--bt-color-text-muted);
    }
    :host(.you) {
      box-shadow:
        0 0 0 2px var(--bt-color-bg),
        0 0 0 4px var(--bt-seat-color);
    }
    .host {
      position: absolute;
      top: -0.55rem;
      right: -0.45rem;
      display: grid;
      place-items: center;
      width: 1.35rem;
      height: 1.35rem;
      border-radius: 50%;
      background: var(--bt-seat-color);
      color: var(--bt-color-surface-raised);
      font-size: 0.7rem;
    }
    .away-mark {
      position: absolute;
      bottom: -0.45rem;
      right: -0.45rem;
      display: grid;
      place-items: center;
      width: 1.35rem;
      height: 1.35rem;
      border: var(--bt-border-width) solid var(--bt-color-border-strong);
      border-radius: 50%;
      background: var(--bt-color-surface-raised);
      color: var(--bt-color-text-muted);
      font-size: 0.75rem;
    }
  `,
})
export class SeatTokenComponent {
  readonly seatIndex = input.required<number>();
  readonly name = input<string>();
  readonly isHost = input(false);
  readonly isYou = input(false);
  /** The player has no live connection right now. */
  readonly away = input(false);

  protected readonly colorIndex = computed(() => this.seatIndex() % SEAT_COLORS);

  protected readonly initials = computed(() => {
    const name = this.name()?.trim();
    if (!name) return '';
    const words = name.split(/\s+/);
    const letters = words.length > 1 ? [words[0]![0], words.at(-1)![0]] : [...name].slice(0, 2);
    return letters.join('').toUpperCase();
  });

  protected readonly description = computed(() => {
    const seat = `Seat ${this.seatIndex() + 1}`;
    const name = this.name();
    if (!name) return `${seat}: free`;
    const tags = [this.isHost() && 'host', this.isYou() && 'you', this.away() && 'away'].filter(
      Boolean,
    );
    return `${seat}: ${name}${tags.length ? ` (${tags.join(', ')})` : ''}`;
  });
}
