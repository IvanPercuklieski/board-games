import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import {
  RESOURCES,
  totalResources,
  type DevCard,
  type Hand,
  type Resource,
  type ResourceCounts,
} from '@board-table/games';
import { ButtonComponent } from '../../ui/button/button.component';
import { SegmentedComponent } from '../../ui/segmented/segmented.component';
import { CARD, RESOURCE_NAME } from './catan-labels';
import { noCounts, ResourceCounterComponent } from './resource-counter.component';
import { ResourceIconComponent } from './resource-icon.component';

export type CardPlay =
  | { card: 'guard' | 'roadCrew' }
  | { card: 'windfall'; resources: [Resource, Resource] }
  | { card: 'market'; resource: Resource };

const PLAYABLE: readonly DevCard[] = ['guard', 'roadCrew', 'windfall', 'market'];
const ORDER: readonly DevCard[] = [...PLAYABLE, 'landmark'];

/**
 * The player's own cards, face up: one card per resource held (with how many), and the
 * development cards with Play buttons. Windfall and Corner the Market ask for their choice in a
 * small panel above the cards.
 */
@Component({
  selector: 'bt-catan-hand',
  imports: [ButtonComponent, ResourceCounterComponent, ResourceIconComponent, SegmentedComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 class="bt-visually-hidden">Your cards</h2>
    @if (resources().length === 0 && cards().length === 0) {
      <p class="empty">No cards yet.</p>
    } @else {
      <ul class="cards" aria-label="Your cards">
        @for (r of resources(); track r.resource) {
          <li [class]="'card resource ' + r.resource">
            <bt-resource-icon class="icon" [resource]="r.resource" />
            <span class="name">{{ r.name }}</span>
            @if (r.count > 1) {
              <span class="count"> ×{{ r.count }}</span>
            }
          </li>
        }
        @for (c of cards(); track c.card) {
          <li class="card dev" [class.waiting]="c.count === 0">
            <span class="name">{{ c.name }}</span>
            @if (c.count + c.waiting > 1) {
              <span class="count"> ×{{ c.count + c.waiting }}</span>
            }
            <span class="text">{{ c.text }}</span>
            @if (c.waiting > 0) {
              <span class="new">{{ c.waiting }} new, playable next turn</span>
            }
            @if (c.playable) {
              <button
                bt-button
                size="sm"
                variant="secondary"
                [attr.aria-label]="'Play ' + c.name"
                [attr.aria-expanded]="c.needsPick ? picking() === c.card : null"
                [disabled]="!canPlay() || c.count === 0"
                (click)="startPlay(c.card)"
              >
                Play
              </button>
            }
          </li>
        }
      </ul>
    }

    @if (picking() === 'windfall') {
      <div class="picker" role="group" aria-label="Windfall: pick two resources">
        <bt-resource-counter label="Take two from the bank" [max]="bank()" [(value)]="windfall" />
        <div class="picker-actions">
          <button bt-button size="sm" [disabled]="windfallTotal() !== 2" (click)="playWindfall()">
            Take them
          </button>
          <button bt-button size="sm" variant="ghost" (click)="picking.set(null)">Cancel</button>
        </div>
      </div>
    } @else if (picking() === 'market') {
      <div class="picker" role="group" aria-label="Corner the Market: pick a resource">
        <bt-segmented label="Resource to collect" [options]="resourceOptions" [(value)]="market" />
        <div class="picker-actions">
          <button bt-button size="sm" (click)="playMarket()">Collect it from everyone</button>
          <button bt-button size="sm" variant="ghost" (click)="picking.set(null)">Cancel</button>
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: block;
    }
    .empty {
      color: var(--bt-color-text-muted);
      font-size: var(--bt-text-sm);
    }
    .cards {
      display: flex;
      flex-wrap: wrap;
      gap: var(--bt-space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .card {
      position: relative;
      display: grid;
      align-content: start;
      justify-items: center;
      gap: var(--bt-space-1);
      width: 4.5rem;
      min-height: 6rem;
      padding: var(--bt-space-3) var(--bt-space-2) var(--bt-space-2);
      border: var(--bt-border-width) solid var(--bt-color-border-strong);
      border-top: 6px solid var(--card-colour);
      border-radius: var(--bt-radius-md);
      background: var(--bt-color-surface-raised);
      box-shadow: var(--bt-shadow-sm);
      text-align: center;
    }
    .card.timber {
      --card-colour: var(--bt-color-terrain-forest);
    }
    .card.clay {
      --card-colour: var(--bt-color-terrain-hills);
    }
    .card.wool {
      --card-colour: var(--bt-color-terrain-pasture);
    }
    .card.grain {
      --card-colour: var(--bt-color-terrain-fields);
    }
    .card.ore {
      --card-colour: var(--bt-color-terrain-mountains);
    }
    .icon {
      font-size: 1.75rem;
    }
    .name {
      font-size: var(--bt-text-xs);
      font-weight: 600;
    }
    .count {
      position: absolute;
      top: calc(-1 * var(--bt-space-2));
      right: calc(-1 * var(--bt-space-2));
      min-width: 1.5rem;
      padding: 0 var(--bt-space-1);
      border-radius: var(--bt-radius-pill);
      background: var(--bt-color-accent);
      color: var(--bt-color-on-accent);
      font-family: var(--bt-font-mono);
      font-size: var(--bt-text-xs);
      font-weight: 600;
      line-height: 1.5rem;
    }
    .card.dev {
      --card-colour: var(--bt-color-accent);
      width: 9rem;
      justify-items: start;
      text-align: left;
    }
    .card.dev .name {
      font-family: var(--bt-font-display);
      font-size: var(--bt-text-sm);
    }
    .card.dev.waiting {
      border-style: dashed;
      box-shadow: none;
    }
    .text {
      color: var(--bt-color-text-muted);
      font-size: var(--bt-text-xs);
      line-height: var(--bt-leading-tight);
    }
    .new {
      color: var(--bt-color-warning-text);
      font-size: var(--bt-text-xs);
    }
    .picker {
      position: absolute;
      bottom: calc(100% + var(--bt-space-2));
      left: 0;
      z-index: 6;
      display: grid;
      gap: var(--bt-space-3);
      width: min(22rem, 100%);
      padding: var(--bt-space-4);
      border: var(--bt-border-width) solid var(--bt-color-border);
      border-radius: var(--bt-radius-lg);
      background: var(--bt-color-surface-raised);
      box-shadow: var(--bt-shadow-lg);
    }
    .picker-actions {
      display: flex;
      gap: var(--bt-space-2);
    }
  `,
})
export class CatanHandComponent {
  readonly hand = input.required<Hand>();
  readonly bank = input.required<ResourceCounts>();
  /** The player may play a card now (their turn, none played yet). */
  readonly canPlay = input(false);
  readonly play = output<CardPlay>();

  /** The card whose choices are open; closes when playing is no longer possible. */
  protected readonly picking = linkedSignal<boolean, DevCard | null>({
    source: this.canPlay,
    computation: () => null,
  });
  protected readonly windfall = signal(noCounts());
  protected readonly market = signal<Resource>('timber');
  protected readonly windfallTotal = computed(() => totalResources(this.windfall()));
  protected readonly resourceOptions = RESOURCES.map((r) => ({
    value: r,
    label: RESOURCE_NAME[r],
  }));

  /** Only the resources the player holds, in the usual order. */
  protected readonly resources = computed(() =>
    RESOURCES.filter((r) => this.hand().resources[r] > 0).map((resource) => ({
      resource,
      name: RESOURCE_NAME[resource],
      count: this.hand().resources[resource],
    })),
  );

  protected readonly cards = computed(() => {
    const { cards, newCards } = this.hand();
    return ORDER.flatMap((card) => {
      const count = cards.filter((c) => c === card).length;
      const waiting = newCards.filter((c) => c === card).length;
      if (count + waiting === 0) return [];
      return [
        {
          card,
          ...CARD[card],
          count,
          waiting,
          playable: PLAYABLE.includes(card),
          needsPick: card === 'windfall' || card === 'market',
        },
      ];
    });
  });

  protected startPlay(card: DevCard) {
    if (card === 'guard' || card === 'roadCrew') {
      this.play.emit({ card });
    } else {
      this.windfall.set(noCounts());
      this.picking.set(card);
    }
  }

  protected playWindfall() {
    const picked = RESOURCES.flatMap((r) => Array<Resource>(this.windfall()[r]).fill(r));
    if (picked.length !== 2) return;
    this.play.emit({ card: 'windfall', resources: [picked[0]!, picked[1]!] });
    this.picking.set(null);
  }

  protected playMarket() {
    this.play.emit({ card: 'market', resource: this.market() });
    this.picking.set(null);
  }
}
