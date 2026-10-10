import { Component, signal } from '@angular/core';
import { render } from '@testing-library/angular';
import {
  PIECE_ANIMATOR,
  PlacePieceDirective,
  PREFERS_REDUCED_MOTION,
} from './place-piece.directive';

@Component({
  imports: [PlacePieceDirective],
  template: `@if (shown()) {
    <span btPlacePiece>X</span>
  }`,
})
class HostComponent {
  readonly shown = signal(true);
}

function setup(reducedMotion: boolean) {
  const stop = vi.fn();
  const animator = vi.fn(() => ({ stop }));
  const providers = [
    { provide: PIECE_ANIMATOR, useValue: animator },
    { provide: PREFERS_REDUCED_MOTION, useValue: () => reducedMotion },
  ];
  return { animator, stop, providers };
}

describe('PlacePieceDirective', () => {
  afterEach(() => vi.restoreAllMocks());

  it('animates a piece when it appears and stops the animation when it is removed', async () => {
    const { animator, stop, providers } = setup(false);
    const view = await render(HostComponent, { providers });
    expect(animator).toHaveBeenCalledTimes(1);
    expect((animator.mock.calls[0] as unknown[])[0]).toBeInstanceOf(HTMLElement);
    view.fixture.componentInstance.shown.set(false);
    view.fixture.detectChanges();
    expect(stop).toHaveBeenCalled();
  });

  it('skips the animation for people who prefer reduced motion', async () => {
    const { animator, providers } = setup(true);
    await render(HostComponent, { providers });
    expect(animator).not.toHaveBeenCalled();
  });
});
