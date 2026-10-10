import { Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  type OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { LIMITS, playerNameSchema, type PreviewResponse } from '@board-table/shared';
import { ApiClient, ApiError } from '../../core/api-client';
import { AuthService } from '../../core/auth.service';
import { asyncAction } from '../../core/async-action';
import { ErrorService } from '../../core/error.service';
import { SeatStore } from '../../core/seat-store';
import { GameCoverComponent } from '../../games/covers/game-cover.component';
import { ButtonComponent } from '../../ui/button/button.component';
import { CardComponent } from '../../ui/card/card.component';
import { EmptyStateComponent } from '../../ui/empty-state/empty-state.component';
import { SpinnerComponent } from '../../ui/feedback/spinner.component';
import { InputDirective, TextFieldComponent } from '../../ui/text-field/text-field.component';

type State = 'loading' | 'ready' | 'invalid' | 'full' | 'started' | 'offline';

/** Reads the invite token from a `t=<token>` URL fragment. */
export function tokenFromFragment(fragment: string | null | undefined): string | null {
  return new URLSearchParams(fragment ?? '').get('t');
}

/**
 * Players arrive here from an invite link and take a free seat: signed out, either as a guest
 * (just a name) or after logging in; signed in, with their account (so they can take over as
 * host later).
 */
@Component({
  selector: 'bt-join-page',
  imports: [
    ButtonComponent,
    CardComponent,
    EmptyStateComponent,
    GameCoverComponent,
    InputDirective,
    SpinnerComponent,
    TextFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main id="main" class="page">
      @switch (state()) {
        @case ('loading') {
          <bt-spinner size="lg" label="Checking your invite" />
        }
        @case ('ready') {
          @if (preview(); as preview) {
            <bt-card class="panel">
              <bt-game-cover [gameId]="preview.gameId" class="cover" />
              <h1>{{ preview.hostName }} invited you to play</h1>
              <p class="game">{{ preview.gameName }}</p>
              <p class="seats">{{ seatsText() }}</p>

              @if (!signedIn() && !asGuest()) {
                <div class="choice">
                  <button bt-button size="lg" (click)="asGuest.set(true)">Continue as guest</button>
                  <button bt-button variant="secondary" size="lg" (click)="logIn()">
                    Log in to join
                  </button>
                  <p class="note">With an account you can take over as host if the host leaves.</p>
                </div>
              } @else {
                <form class="form" novalidate (submit)="join($event)">
                  <bt-text-field
                    label="Your name"
                    hint="Shown to the other players."
                    [error]="showErrors() ? nameError() : null"
                  >
                    <input
                      btInput
                      name="name"
                      autocomplete="nickname"
                      maxlength="24"
                      [value]="name()"
                      (input)="name.set(value($event))"
                    />
                  </bt-text-field>
                  @if (signedIn()) {
                    <p class="note">You join with your account.</p>
                  }
                  <button bt-button type="submit" size="lg" [loading]="joinAction.busy()">
                    Take a seat
                  </button>
                </form>
              }
            </bt-card>
          }
        }
        @case ('invalid') {
          <bt-empty-state
            icon="link"
            title="This invite link doesn’t work"
            description="It may be mistyped, replaced by a newer link, or the game is over. Ask the host for a fresh link."
          />
        }
        @case ('full') {
          <bt-empty-state
            icon="users"
            title="This table is full"
            description="Every seat is taken. If a seat frees up, the host can let you in."
          />
        }
        @case ('started') {
          <bt-empty-state
            icon="hourglass-medium"
            title="This game has already started"
            description="New players can only join a running game if the host frees a seat."
          />
        }
        @case ('offline') {
          <bt-empty-state
            icon="warning-circle"
            title="Can’t reach the table right now"
            description="Check your connection and try again."
          >
            <button bt-button variant="secondary" (click)="load()">Try again</button>
          </bt-empty-state>
        }
      }
    </main>
  `,
  styles: `
    .page {
      display: grid;
      place-items: center;
      min-height: calc(100dvh - 4.5rem);
      padding: var(--bt-space-8) var(--bt-space-4);
    }
    .panel {
      display: grid;
      gap: var(--bt-space-3);
      width: min(28rem, 100%);
      padding: var(--bt-space-6);
    }
    .cover {
      margin-bottom: var(--bt-space-2);
    }
    h1 {
      font-size: var(--bt-text-2xl);
    }
    .game {
      font-family: var(--bt-font-display);
      font-size: var(--bt-text-lg);
    }
    .seats {
      color: var(--bt-color-text-muted);
      font-size: var(--bt-text-sm);
    }
    .form,
    .choice {
      display: grid;
      gap: var(--bt-space-4);
      margin-top: var(--bt-space-3);
    }
    .choice {
      gap: var(--bt-space-3);
    }
    .note {
      color: var(--bt-color-text-muted);
      font-size: var(--bt-text-sm);
    }
  `,
})
export class JoinPage implements OnInit {
  /** Route param. */
  readonly roomId = input.required<string>();
  /** URL fragment ("t=<token>"), resolved by the route. */
  readonly fragment = input<string | null>(null);

  private readonly api = inject(ApiClient);
  private readonly seatStore = inject(SeatStore);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly auth = inject(AuthService);

  protected readonly state = signal<State>('loading');
  protected readonly preview = signal<PreviewResponse | null>(null);
  protected readonly name = signal('');
  protected readonly showErrors = signal(false);
  protected readonly signedIn = this.auth.isSignedIn;
  /** A signed-out player chose to join without an account. */
  protected readonly asGuest = signal(false);
  private readonly errors = inject(ErrorService);
  private token: string | null = null;

  protected readonly joinAction = asyncAction(
    async (token: string, name: string) => {
      const seat = await this.api.join(
        this.roomId(),
        { token, name },
        { withAccount: this.signedIn() },
      );
      this.seatStore.saveSeat(this.roomId(), seat);
      await this.router.navigateByUrl(`/rooms/${this.roomId()}`);
    },
    {
      context: 'You couldn’t take a seat.',
      onError: (e) => this.state.set(stateFor(e)), // the page explains it too
    },
  );

  protected readonly nameError = computed(() =>
    playerNameSchema.safeParse(this.name()).success ? null : 'Enter the name the others will see',
  );
  protected readonly seatsText = computed(() => {
    const free = this.preview()?.freeSeats ?? 0;
    return `${free} ${free === 1 ? 'seat' : 'seats'} free`;
  });

  ngOnInit() {
    if (this.seatStore.seat(this.roomId())) {
      void this.router.navigateByUrl(`/rooms/${this.roomId()}`);
      return;
    }
    // From the link, or kept for this tab while the player logged in.
    // (always taken, so a token stashed by an earlier visit doesn't linger in the tab)
    const stashed = this.seatStore.takeInviteToken(this.roomId());
    this.token = tokenFromFragment(this.fragment()) ?? stashed ?? null;
    // Keep the secret out of the address bar (screen sharing, screenshots).
    this.location.replaceState(`/join/${this.roomId()}`);
    const displayName = this.auth.user()?.displayName;
    if (displayName)
      this.name.set([...displayName.trim()].slice(0, LIMITS.playerNameMaxLength).join(''));
    void this.load();
  }

  protected async load() {
    if (!this.token) {
      this.state.set('invalid');
      return;
    }
    this.state.set('loading');
    try {
      const preview = await this.api.preview(this.roomId(), this.token);
      this.preview.set(preview);
      this.state.set(
        preview.freeSeats > 0 ? 'ready' : preview.status === 'playing' ? 'started' : 'full',
      );
    } catch (e) {
      this.state.set(stateFor(e));
      this.errors.report(e, { context: 'The table couldn’t be loaded.' });
    }
  }

  protected value(event: Event) {
    return (event.target as HTMLInputElement).value;
  }

  /** Log in first; the token waits in this tab (never in the login URL) and we come back. */
  protected async logIn() {
    if (!this.token) return;
    this.seatStore.stashInviteToken(this.roomId(), this.token);
    const next = encodeURIComponent(`/join/${this.roomId()}`);
    await this.router.navigateByUrl(`/login?next=${next}`);
  }

  protected async join(event: Event) {
    event.preventDefault();
    this.showErrors.set(true);
    const name = playerNameSchema.safeParse(this.name());
    if (!name.success || !this.token) return;
    await this.joinAction.run(this.token, name.data);
  }
}

function stateFor(error: unknown): State {
  if (!(error instanceof ApiError)) return 'offline';
  switch (error.code) {
    case 'not_found':
      return 'invalid';
    case 'room_full':
      return 'full';
    case 'room_locked':
      return 'started';
    default:
      return 'offline';
  }
}
