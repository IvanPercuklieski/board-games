import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { asyncAction } from '../core/async-action';
import { AuthService } from '../core/auth.service';
import { ButtonComponent } from '../ui/button/button.component';
import { IconButtonComponent } from '../ui/button/icon-button.component';
import type { IconName } from '../ui/icon/icons';
import { ThemeService, type ThemeMode } from '../ui/theme/theme.service';
import { ToastOutletComponent } from '../ui/toast/toast-outlet.component';
import { NavigationProgressComponent } from './navigation-progress.component';

const NEXT_MODE: Record<ThemeMode, ThemeMode> = { system: 'light', light: 'dark', dark: 'system' };
const MODE_ICON: Record<ThemeMode, IconName> = { system: 'desktop', light: 'sun', dark: 'moon' };

/**
 * Page frame: page-change progress bar, skip link, header (wordmark, host navigation, colour
 * mode, user), toasts.
 */
@Component({
  selector: 'bt-shell',
  imports: [
    ButtonComponent,
    IconButtonComponent,
    NavigationProgressComponent,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    ToastOutletComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <bt-navigation-progress />
    <a class="skip" href="#main">Skip to content</a>

    <header class="header">
      <div class="bar">
        <a class="wordmark" routerLink="/" aria-label="board·table home">
          board<span class="dot" aria-hidden="true">·</span>table
        </a>

        @if (auth.isSignedIn()) {
          <nav aria-label="Main" class="nav">
            <a
              routerLink="/"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: true }"
              ariaCurrentWhenActive="page"
              >Games</a
            >
            <a routerLink="/rooms" routerLinkActive="active" ariaCurrentWhenActive="page"
              >My rooms</a
            >
          </nav>
        }

        <div class="tools">
          <button
            bt-icon-button
            [icon]="modeIcon()"
            [label]="'Colour mode: ' + theme.mode()"
            (click)="cycleMode()"
          ></button>
          @if (auth.user(); as user) {
            <span class="user">{{ user.displayName }}</span>
            <button
              bt-button
              variant="ghost"
              size="sm"
              [loading]="logOutAction.busy()"
              (click)="logOutAction.run()"
            >
              Log out
            </button>
          }
        </div>
      </div>
    </header>

    <router-outlet />
    <bt-toast-outlet />
  `,
  styles: `
    :host {
      display: block;
      min-height: 100dvh;
    }
    .skip {
      position: absolute;
      left: var(--bt-space-4);
      top: -4rem;
      z-index: 100;
      padding: var(--bt-space-2) var(--bt-space-4);
      border-radius: var(--bt-radius-md);
      background: var(--bt-color-accent);
      color: var(--bt-color-on-accent);
      font-weight: 600;
    }
    .skip:focus {
      top: var(--bt-space-3);
    }
    .header {
      border-bottom: var(--bt-border-width) solid var(--bt-color-border);
      background: color-mix(in srgb, var(--bt-color-bg) 92%, transparent);
    }
    .bar {
      display: flex;
      align-items: center;
      gap: var(--bt-space-8);
      max-width: var(--bt-content-max);
      min-height: 4.5rem;
      margin: 0 auto;
      padding: 0 var(--bt-space-6);
    }
    .wordmark {
      font-family: var(--bt-font-display);
      font-size: var(--bt-text-xl);
      font-weight: 600;
      letter-spacing: -0.02em;
      color: var(--bt-color-text);
      text-decoration: none;
    }
    .dot {
      color: var(--bt-color-accent-text);
      padding: 0 0.05em;
    }
    .nav {
      display: flex;
      gap: var(--bt-space-1);
    }
    .nav a {
      padding: var(--bt-space-2) var(--bt-space-3);
      border-radius: var(--bt-radius-md);
      color: var(--bt-color-text-muted);
      font-weight: 500;
      text-decoration: none;
    }
    .nav a:hover {
      color: var(--bt-color-text);
      background: var(--bt-color-surface-sunken);
    }
    .nav a.active {
      color: var(--bt-color-text);
      box-shadow: inset 0 -2px 0 var(--bt-color-accent);
      border-radius: var(--bt-radius-md) var(--bt-radius-md) 0 0;
    }
    .tools {
      display: flex;
      align-items: center;
      gap: var(--bt-space-2);
      margin-left: auto;
    }
    .user {
      padding-left: var(--bt-space-2);
      color: var(--bt-color-text-muted);
      font-size: var(--bt-text-sm);
    }
    @media (max-width: 40rem) {
      .bar {
        flex-wrap: wrap;
        gap: var(--bt-space-3);
        padding: var(--bt-space-3) var(--bt-space-4);
      }
      .nav {
        order: 3;
        width: 100%;
      }
      .user {
        display: none;
      }
    }
  `,
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);

  protected readonly modeIcon = computed(() => MODE_ICON[this.theme.mode()]);

  protected cycleMode() {
    this.theme.setMode(NEXT_MODE[this.theme.mode()]);
  }

  protected readonly logOutAction = asyncAction(
    async () => {
      try {
        await this.auth.signOut();
      } finally {
        await this.router.navigateByUrl('/login'); // even if something failed on the way
      }
    },
    { context: 'Logging out didn’t finish.' },
  );
}
