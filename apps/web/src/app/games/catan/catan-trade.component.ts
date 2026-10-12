import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  bankRatios,
  hasAll,
  RESOURCES,
  totalResources,
  type CatanState,
  type Resource,
  type ResourceCounts,
} from '@board-table/games';
import { ButtonComponent } from '../../ui/button/button.component';
import { SegmentedComponent } from '../../ui/segmented/segmented.component';
import { describeCounts, RESOURCE_NAME } from './catan-labels';
import { noCounts, ResourceCounterComponent } from './resource-counter.component';

export interface BankTrade {
  give: Resource;
  get: Resource;
}

export interface TradeOfferDraft {
  give: ResourceCounts;
  want: ResourceCounts;
}

/** Trading on your turn: with the bank (4:1, or better at your harbours) or an offer to the table. */
@Component({
  selector: 'bt-catan-trade',
  imports: [ButtonComponent, ResourceCounterComponent, SegmentedComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="part" aria-labelledby="bank-title">
      <h3 id="bank-title">With the bank</h3>
      <bt-segmented label="You give" [options]="giveOptions()" [(value)]="give" />
      <bt-segmented label="You get" [options]="getOptions" [(value)]="get" />
      <button bt-button size="sm" [disabled]="!bankTradeOk()" (click)="tradeWithBank()">
        {{ bankLabel() }}
      </button>
    </section>

    <section class="part" aria-labelledby="offer-title">
      <h3 id="offer-title">Offer to the table</h3>
      <div class="sides">
        <bt-resource-counter label="You give" [max]="hand()" [(value)]="offerGive" />
        <bt-resource-counter label="You want" [(value)]="offerWant" />
      </div>
      <button bt-button size="sm" [disabled]="!offerOk()" (click)="makeOffer()">
        {{ offerLabel() }}
      </button>
    </section>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--bt-space-5);
    }
    .part {
      display: grid;
      gap: var(--bt-space-3);
      justify-items: start;
    }
    h3 {
      font-size: var(--bt-text-base);
    }
    .sides {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
      gap: var(--bt-space-5);
      width: 100%;
    }
  `,
})
export class CatanTradeComponent {
  readonly state = input.required<CatanState>();
  readonly me = input.required<string>();
  readonly bankTrade = output<BankTrade>();
  readonly offer = output<TradeOfferDraft>();

  protected readonly give = signal<Resource>('timber');
  protected readonly get = signal<Resource>('ore');
  protected readonly offerGive = signal(noCounts());
  protected readonly offerWant = signal(noCounts());

  protected readonly hand = computed(() => this.state().hands[this.me()]!.resources);
  private readonly ratios = computed(() => bankRatios(this.state(), this.me()));

  protected readonly giveOptions = computed(() =>
    RESOURCES.map((r) => ({ value: r, label: `${RESOURCE_NAME[r]} ${this.ratios()[r]}:1` })),
  );
  protected readonly getOptions = RESOURCES.map((r) => ({ value: r, label: RESOURCE_NAME[r] }));

  protected readonly bankTradeOk = computed(
    () =>
      this.give() !== this.get() &&
      this.hand()[this.give()] >= this.ratios()[this.give()] &&
      this.state().bank[this.get()] > 0,
  );
  protected readonly bankLabel = computed(
    () =>
      `Trade ${this.ratios()[this.give()]} ${RESOURCE_NAME[this.give()].toLowerCase()} ` +
      `for 1 ${RESOURCE_NAME[this.get()].toLowerCase()}`,
  );

  protected readonly offerOk = computed(() => {
    const give = this.offerGive();
    const want = this.offerWant();
    return (
      totalResources(give) > 0 &&
      totalResources(want) > 0 &&
      !RESOURCES.some((r) => give[r] > 0 && want[r] > 0) &&
      hasAll(this.hand(), give)
    );
  });
  protected readonly offerLabel = computed(() =>
    this.offerOk()
      ? `Offer ${describeCounts(this.offerGive())} for ${describeCounts(this.offerWant())}`
      : 'Offer to the table',
  );

  protected tradeWithBank() {
    if (this.bankTradeOk()) this.bankTrade.emit({ give: this.give(), get: this.get() });
  }

  protected makeOffer() {
    if (!this.offerOk()) return;
    this.offer.emit({ give: this.offerGive(), want: this.offerWant() });
  }
}
