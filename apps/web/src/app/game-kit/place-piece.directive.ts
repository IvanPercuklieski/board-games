import {
  DestroyRef,
  Directive,
  ElementRef,
  InjectionToken,
  afterNextRender,
  inject,
} from '@angular/core';
import { animate } from 'motion';

/** Starts an animation on an element and returns a handle to stop it. */
export type PieceAnimator = (element: HTMLElement) => { stop(): void };

/** Default: the piece drops onto the table with a small spring (Motion). Replaceable in tests. */
export const PIECE_ANIMATOR = new InjectionToken<PieceAnimator>('PIECE_ANIMATOR', {
  providedIn: 'root',
  factory: () => (element) =>
    animate(
      element,
      { opacity: [0, 1], transform: ['scale(0.55) rotate(-8deg)', 'scale(1) rotate(0deg)'] },
      { type: 'spring', stiffness: 420, damping: 24 },
    ),
});

/** Whether the person asked the system for reduced motion. */
export const PREFERS_REDUCED_MOTION = new InjectionToken<() => boolean>('PREFERS_REDUCED_MOTION', {
  providedIn: 'root',
  factory: () => () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
});

/**
 * Plays the "piece placed" animation when the element appears (reusable by every game).
 * Skipped for prefers-reduced-motion; a running animation is stopped when the piece goes away.
 */
@Directive({ selector: '[btPlacePiece]' })
export class PlacePieceDirective {
  constructor() {
    const element = inject(ElementRef<HTMLElement>).nativeElement;
    const animator = inject(PIECE_ANIMATOR);
    const prefersReducedMotion = inject(PREFERS_REDUCED_MOTION);
    let animation: { stop(): void } | undefined;

    afterNextRender(() => {
      if (prefersReducedMotion()) return;
      animation = animator(element);
    });
    inject(DestroyRef).onDestroy(() => animation?.stop());
  }
}
