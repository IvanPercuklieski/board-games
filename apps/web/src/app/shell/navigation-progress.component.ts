import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
} from '@angular/router';
import { filter, map, of, switchMap, timer } from 'rxjs';

/** Page changes faster than this show no bar (no flicker on cached pages). */
const SHOW_AFTER_MS = 150;

/**
 * A thin bar at the top while a page change takes a moment (lazy page code on a slow
 * connection, or the free server waking up). Indeterminate; static with reduced motion.
 */
@Component({
  selector: 'bt-navigation-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div class="track" role="progressbar" aria-label="Loading page">
        <div class="bar"></div>
      </div>
    }
  `,
  styles: `
    .track {
      position: fixed;
      inset: 0 0 auto;
      z-index: 1001;
      height: 3px;
      overflow: hidden;
      background: var(--bt-color-accent-subtle);
    }
    .bar {
      width: 40%;
      height: 100%;
      background: var(--bt-color-accent);
      animation: slide 1.2s var(--bt-ease-standard) infinite;
    }
    @keyframes slide {
      from {
        transform: translateX(-100%);
      }
      to {
        transform: translateX(250%);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .bar {
        width: 100%;
        animation: none;
      }
    }
  `,
})
export class NavigationProgressComponent {
  private readonly router = inject(Router);

  /** The subscription is owned by toSignal and ends with the component. */
  protected readonly visible = toSignal(
    this.router.events.pipe(
      filter(
        (e) =>
          e instanceof NavigationStart ||
          e instanceof NavigationEnd ||
          e instanceof NavigationCancel ||
          e instanceof NavigationError,
      ),
      map((e) => e instanceof NavigationStart),
      switchMap((started) => (started ? timer(SHOW_AFTER_MS).pipe(map(() => true)) : of(false))),
    ),
    { initialValue: false },
  );
}
