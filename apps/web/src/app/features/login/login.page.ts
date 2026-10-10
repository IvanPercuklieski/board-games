import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiError } from '../../core/api-client';
import { asyncAction } from '../../core/async-action';
import { AuthService } from '../../core/auth.service';
import { ButtonComponent } from '../../ui/button/button.component';
import { CardComponent } from '../../ui/card/card.component';
import { IconComponent } from '../../ui/icon/icon.component';
import { InputDirective, TextFieldComponent } from '../../ui/text-field/text-field.component';

/** Only same-site paths are allowed after login (no open redirects). */
export function safeNextUrl(next: string | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
  return next;
}

@Component({
  selector: 'bt-login-page',
  imports: [ButtonComponent, CardComponent, IconComponent, InputDirective, TextFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main id="main" class="page">
      <bt-card class="panel">
        <form class="form" novalidate (submit)="submit($event)">
          <header class="intro">
            <h1>Log in</h1>
            <p class="lede">Host a game and invite your friends to the table.</p>
          </header>

          @if (failure()) {
            <p class="failure" role="alert">
              <bt-icon name="warning-circle" />
              {{ failure() }}
            </p>
          }

          <bt-text-field label="Email" [error]="showErrors() ? emailError() : null">
            <input
              btInput
              type="email"
              name="email"
              autocomplete="username"
              [value]="email()"
              (input)="email.set(value($event))"
            />
          </bt-text-field>

          <bt-text-field label="Password" [error]="showErrors() ? passwordError() : null">
            <input
              btInput
              type="password"
              name="password"
              autocomplete="current-password"
              [value]="password()"
              (input)="password.set(value($event))"
            />
          </bt-text-field>

          <button bt-button type="submit" size="lg" [loading]="loginAction.busy()">Log in</button>
        </form>
      </bt-card>

      <p class="note">
        Accounts are created by the admin. Got an invite link? Just open it, no account needed.
      </p>
    </main>
  `,
  styles: `
    .page {
      display: grid;
      align-content: center;
      justify-items: center;
      gap: var(--bt-space-5);
      min-height: calc(100dvh - 4.5rem);
      padding: var(--bt-space-8) var(--bt-space-4);
    }
    .panel {
      width: min(26rem, 100%);
      padding: var(--bt-space-8);
    }
    .form {
      display: grid;
      gap: var(--bt-space-5);
    }
    .intro {
      display: grid;
      gap: var(--bt-space-2);
    }
    .lede {
      color: var(--bt-color-text-muted);
    }
    .failure {
      display: flex;
      align-items: center;
      gap: var(--bt-space-2);
      padding: var(--bt-space-3) var(--bt-space-4);
      border-radius: var(--bt-radius-md);
      background: var(--bt-color-danger-subtle);
      color: var(--bt-color-danger-text);
      font-size: var(--bt-text-sm);
      font-weight: 500;
    }
    .note {
      max-width: 26rem;
      color: var(--bt-color-text-muted);
      font-size: var(--bt-text-sm);
      text-align: center;
    }
  `,
})
export class LoginPage {
  /** Where to go after logging in (query param, bound by the router). */
  readonly next = input<string>();

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly showErrors = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected readonly emailError = computed(() =>
    /^\S+@\S+\.\S+$/.test(this.email().trim()) ? null : 'Enter your email address',
  );
  protected readonly passwordError = computed(() =>
    this.password() ? null : 'Enter your password',
  );

  protected value(event: Event) {
    return (event.target as HTMLInputElement).value;
  }

  protected readonly loginAction = asyncAction(
    async (email: string, password: string) => {
      const result = await this.auth.signIn(email, password);
      if (result === 'ok') {
        await this.router.navigateByUrl(safeNextUrl(this.next()));
        return;
      }
      // the form explains it; anything but wrong credentials is also reported (toast + log)
      if (result === 'invalid_credentials') {
        this.failure.set('That email or password is wrong.');
        return;
      }
      this.failure.set('Logging in didn’t work just now. Please try again.');
      throw result === 'network' ? new ApiError('network', 0) : new Error('Sign-in failed');
    },
    { context: 'Logging in didn’t work.' },
  );

  protected async submit(event: Event) {
    event.preventDefault();
    this.showErrors.set(true);
    this.failure.set(null);
    if (this.emailError() || this.passwordError()) return;
    await this.loginAction.run(this.email().trim(), this.password());
  }
}
