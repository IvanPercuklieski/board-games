import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { hasAll, type CatanState, type ResourceCounts, type TradeOffer } from '@board-table/games';
import type { SessionPlayer } from '../../game-client/game-session';
import { ButtonComponent } from '../../ui/button/button.component';
import { describeCounts } from './catan-labels';
import { noCounts, ResourceCounterComponent } from './resource-counter.component';
import { termsOk } from './trade-terms';

export interface CounterTerms {
  give: ResourceCounts;
  want: ResourceCounts;
}

/**
 * An open trade offer. The player who made it sees everyone's answers and suggested terms and
 * picks a partner; everyone else accepts, declines or suggests other terms.
 */
@Component({
  selector: 'bt-catan-offer',
  imports: [ButtonComponent, ResourceCounterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (offer(); as o) {
      @if (isOwner()) {
        <p class="what">You offer {{ describe(o.give) }} for {{ describe(o.want) }}.</p>
        <ul aria-label="Answers">
          @for (a of answers(); track a.playerID) {
            <li>
              @if (a.counter; as c) {
                <span>
                  {{ a.name }} suggests {{ describe(c.give) }} for {{ describe(c.want) }}
                </span>
                <button
                  bt-button
                  size="sm"
                  [disabled]="!a.canPayCounter"
                  (click)="acceptCounter.emit(a.playerID)"
                >
                  Accept {{ a.name }}’s terms
                </button>
              } @else {
                <span>{{ a.name }}</span>
                @if (a.answer === true) {
                  <button bt-button size="sm" (click)="confirm.emit(a.playerID)">
                    Trade with {{ a.name }}
                  </button>
                } @else {
                  <span class="muted">{{ a.answer === false ? 'Declines' : 'Thinking…' }}</span>
                }
              }
            </li>
          }
        </ul>
        <button bt-button size="sm" variant="secondary" (click)="cancel.emit()">
          Cancel offer
        </button>
      } @else {
        <p class="what">
          {{ ownerName() }} offers {{ describe(o.give) }} for {{ describe(o.want) }}.
        </p>
        @if (!canPay()) {
          <p class="muted">You don’t have {{ describe(o.want) }}.</p>
        }
        <div class="actions">
          <button
            bt-button
            size="sm"
            [attr.aria-pressed]="myAnswer() === true"
            [disabled]="!canPay()"
            (click)="respond.emit(true)"
          >
            Accept
          </button>
          <button
            bt-button
            size="sm"
            variant="secondary"
            [attr.aria-pressed]="myAnswer() === false"
            (click)="respond.emit(false)"
          >
            Decline
          </button>
          <button
            bt-button
            size="sm"
            variant="ghost"
            [attr.aria-expanded]="countering()"
            (click)="toggleCounter(o)"
          >
            Suggest other terms
          </button>
        </div>

        @if (countering()) {
          <div class="counter" role="group" aria-label="Your terms">
            <div class="sides">
              <bt-resource-counter label="You give" [max]="hand()" [(value)]="counterGive" />
              <bt-resource-counter label="You want" [(value)]="counterWant" />
            </div>
            <button bt-button size="sm" [disabled]="!counterOk()" (click)="sendCounter()">
              {{ counterLabel() }}
            </button>
          </div>
        }

        @if (myCounter(); as c) {
          <p class="muted" role="status">
            You suggested {{ describe(c.give) }} for {{ describe(c.want) }}. Waiting for
            {{ ownerName() }}.
          </p>
        } @else if (myAnswer() !== undefined) {
          <p class="muted" role="status">
            You {{ myAnswer() ? 'accepted' : 'declined' }}. You can change your answer until
            {{ ownerName() }} decides.
          </p>
        }
      }
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--bt-space-3);
      justify-items: start;
    }
    .what {
      font-weight: 600;
    }
    ul {
      display: grid;
      gap: var(--bt-space-2);
      width: 100%;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--bt-space-2) var(--bt-space-3);
      min-height: 2.25rem;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--bt-space-2);
    }
    .counter {
      display: grid;
      gap: var(--bt-space-3);
      justify-items: start;
      width: 100%;
      padding: var(--bt-space-3);
      border-radius: var(--bt-radius-md);
      background: var(--bt-color-surface-sunken);
    }
    .sides {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
      gap: var(--bt-space-5);
      width: 100%;
    }
    .muted {
      color: var(--bt-color-text-muted);
      font-size: var(--bt-text-sm);
    }
  `,
})
export class CatanOfferComponent {
  readonly state = input.required<CatanState>();
  readonly me = input.required<string>();
  /** Whose turn it is (the player who made the offer). */
  readonly owner = input.required<string>();
  readonly players = input.required<readonly SessionPlayer[]>();
  readonly respond = output<boolean>();
  readonly counter = output<CounterTerms>();
  readonly confirm = output<string>();
  readonly acceptCounter = output<string>();
  readonly cancel = output<void>();

  protected readonly countering = signal(false);
  protected readonly counterGive = signal(noCounts());
  protected readonly counterWant = signal(noCounts());

  protected readonly offer = computed<TradeOffer | null>(() => this.state().turn.trade);
  protected readonly isOwner = computed(() => this.me() === this.owner());
  protected readonly ownerName = computed(
    () => this.players().find((p) => p.playerID === this.owner())?.name ?? 'The current player',
  );
  protected readonly hand = computed(() => this.state().hands[this.me()]!.resources);
  protected readonly myAnswer = computed(() => this.offer()?.responses[this.me()]);
  protected readonly myCounter = computed(() => this.offer()?.counters[this.me()]);
  protected readonly canPay = computed(() => {
    const offer = this.offer();
    return !!offer && hasAll(this.hand(), offer.want);
  });
  protected readonly counterOk = computed(() =>
    termsOk(this.counterGive(), this.counterWant(), this.hand()),
  );
  protected readonly counterLabel = computed(() =>
    this.counterOk()
      ? `Suggest ${describeCounts(this.counterGive())} for ${describeCounts(this.counterWant())}`
      : 'Suggest these terms',
  );
  protected readonly answers = computed(() =>
    this.players()
      .filter((p) => p.playerID !== this.owner())
      .map((p) => {
        const counter = this.offer()?.counters[p.playerID];
        return {
          playerID: p.playerID,
          name: p.name,
          answer: this.offer()?.responses[p.playerID],
          counter,
          // the counter's "want" is what the player who offered would give
          canPayCounter: !!counter && hasAll(this.hand(), counter.want),
        };
      }),
  );

  protected readonly describe = describeCounts;

  /** Opens the terms form, starting from the offer seen from this player's side. */
  protected toggleCounter(offer: TradeOffer) {
    if (!this.countering()) {
      this.counterGive.set({ ...offer.want });
      this.counterWant.set({ ...offer.give });
    }
    this.countering.update((open) => !open);
  }

  protected sendCounter() {
    if (!this.counterOk()) return;
    this.counter.emit({ give: this.counterGive(), want: this.counterWant() });
    this.countering.set(false);
  }
}
