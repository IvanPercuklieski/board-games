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
import { ResourceSwatchComponent } from './resource-swatch.component';

export type CardPlay =
  | { card: 'guard' | 'roadCrew' }
  | { card: 'windfall'; resources: [Resource, Resource] }
  | { card: 'market'; resource: Resource };

const PLAYABLE: readonly DevCard[] = ['guard', 'roadCrew', 'windfall', 'market'];
const ORDER: readonly DevCard[] = [...PLAYABLE, 'landmark'];

/** The player's own cards: resources, and development cards with Play buttons. */
@Component({
  selector: 'bt-catan-hand',
  imports: [ButtonComponent, ResourceCounterComponent, ResourceSwatchComponent, SegmentedComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 class="title">Your hand</h2>
    <ul class="resources" aria-label="Resources">
      @for (r of resources(); track r.resource) {
        <li [class.none]="r.count === 0">
          <bt-resource-swatch [resource]="r.resource" />
          <span
            ><span class="count">{{ r.count }}</span> {{ r.name }}</span
          >
        </li>
      }
    </ul>

    @if (cards().length > 0) {
      <ul class="cards" aria-label="Development cards">
        @for (c of cards(); track c.card) {
          <li>
            <div class="card-text">
              <strong>{{ c.name }}</strong>
              @if (c.count > 1) {
                <span class="times">×{{ c.count }}</span>
              }
              @if (c.waiting > 0) {
                <span class="new">{{ c.waiting }} new, playable next turn</span>
              }
              <p>{{ c.text }}</p>
            </div>
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
      display: grid;
      gap: var(--bt-space-3);
    }
    .title {
      font-size: var(--bt-text-lg);
    }
    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .resources {
      display: flex;
      flex-wrap: wrap;
      gap: var(--bt-space-2);
    }
    .resources li {
      display: inline-flex;
      align-items: center;
      gap: var(--bt-space-2);
      padding: var(--bt-space-1) var(--bt-space-3);
      border-radius: var(--bt-radius-md);
      background: var(--bt-color-surface-sunken);
      font-size: var(--bt-text-sm);
    }
    .resources li.none {
      color: var(--bt-color-text-muted);
    }
    .count {
      font-family: var(--bt-font-mono);
      font-weight: 600;
    }
    .cards {
      display: grid;
      gap: var(--bt-space-2);
    }
    .cards li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--bt-space-3);
      padding: var(--bt-space-3);
      border: var(--bt-border-width) solid var(--bt-color-border);
      border-radius: var(--bt-radius-md);
      background: var(--bt-color-surface-raised);
    }
    .card-text p {
      margin-top: var(--bt-space-1);
      color: var(--bt-color-text-muted);
      font-size: var(--bt-text-sm);
    }
    .times {
      margin-left: var(--bt-space-1);
      font-family: var(--bt-font-mono);
    }
    .new {
      margin-left: var(--bt-space-2);
      color: var(--bt-color-warning-text);
      font-size: var(--bt-text-xs);
    }
    .picker {
      display: grid;
      gap: var(--bt-space-3);
      padding: var(--bt-space-3);
      border-radius: var(--bt-radius-md);
      background: var(--bt-color-surface-sunken);
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

  protected readonly resources = computed(() =>
    RESOURCES.map((resource) => ({
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
