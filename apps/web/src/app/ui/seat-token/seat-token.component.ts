import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

const SEAT_COLORS = 8;

/**
 * A player's place at the table: initials inside a ring in the seat's colour.
 * Free seats show a dashed ring. Announced as e.g. "Seat 2: Bob (you)".
 */
@Component({
  selector: 'bt-seat-token',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.--bt-seat-color]': '"var(--bt-color-seat-" + colorIndex() + ")"',
    '[class.free]': '!name()',
    '[class.you]': 'isYou()',
    role: 'img',
    '[attr.aria-label]': 'description()',
  },
  template: `
    <span class="initials" aria-hidden="true">{{ initials() }}</span>
    @if (isHost()) {
      <span class="host" aria-hidden="true"><bt-icon name="crown" /></span>
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
  `,
})
export class SeatTokenComponent {
  readonly seatIndex = input.required<number>();
  readonly name = input<string>();
  readonly isHost = input(false);
  readonly isYou = input(false);

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
    const tags = [this.isHost() && 'host', this.isYou() && 'you'].filter(Boolean);
    return `${seat}: ${name}${tags.length ? ` (${tags.join(', ')})` : ''}`;
  });
}
