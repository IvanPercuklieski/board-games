import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { hasAll, type CatanState, type TradeOffer } from '@board-table/games';
import type { SessionPlayer } from '../../game-client/game-session';
import { ButtonComponent } from '../../ui/button/button.component';
import { describeCounts } from './catan-labels';

/**
 * An open trade offer. The player who made it sees everyone's answers and picks a partner;
 * everyone else accepts or declines.
 */
@Component({
  selector: 'bt-catan-offer',
  imports: [ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (offer(); as o) {
      @if (isOwner()) {
        <p class="what">You offer {{ describe(o.give) }} for {{ describe(o.want) }}.</p>
        <ul aria-label="Answers">
          @for (a of answers(); track a.playerID) {
            <li>
              <span>{{ a.name }}</span>
              @if (a.answer === true) {
                <button bt-button size="sm" (click)="confirm.emit(a.playerID)">
                  Trade with {{ a.name }}
                </button>
              } @else {
                <span class="muted">{{ a.answer === false ? 'Declines' : 'Thinking…' }}</span>
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
        </div>
        @if (myAnswer() !== undefined) {
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
      align-items: center;
      justify-content: space-between;
      gap: var(--bt-space-3);
      min-height: 2.25rem;
    }
    .actions {
      display: flex;
      gap: var(--bt-space-2);
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
  readonly confirm = output<string>();
  readonly cancel = output<void>();

  protected readonly offer = computed<TradeOffer | null>(() => this.state().turn.trade);
  protected readonly isOwner = computed(() => this.me() === this.owner());
  protected readonly ownerName = computed(
    () => this.players().find((p) => p.playerID === this.owner())?.name ?? 'The current player',
  );
  protected readonly myAnswer = computed(() => this.offer()?.responses[this.me()]);
  protected readonly canPay = computed(() => {
    const offer = this.offer();
    return !!offer && hasAll(this.state().hands[this.me()]!.resources, offer.want);
  });
  protected readonly answers = computed(() =>
    this.players()
      .filter((p) => p.playerID !== this.owner())
      .map((p) => ({
        playerID: p.playerID,
        name: p.name,
        answer: this.offer()?.responses[p.playerID],
      })),
  );

  protected readonly describe = describeCounts;
}
