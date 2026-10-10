import { Router, NavigationEnd, NavigationStart, type Event } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { Subject } from 'rxjs';
import { NavigationProgressComponent } from './navigation-progress.component';

async function setup() {
  const events = new Subject<Event>();
  const view = await render(NavigationProgressComponent, {
    providers: [{ provide: Router, useValue: { events } }],
  });
  return { events, view };
}

describe('NavigationProgressComponent', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows a bar only when a page change takes a moment', async () => {
    const { events, view } = await setup();
    events.next(new NavigationStart(1, '/rooms'));
    await vi.advanceTimersByTimeAsync(100);
    view.fixture.detectChanges();
    expect(screen.queryByRole('progressbar')).toBeNull();

    await vi.advanceTimersByTimeAsync(100);
    view.fixture.detectChanges();
    expect(screen.getByRole('progressbar', { name: 'Loading page' })).toBeTruthy();

    events.next(new NavigationEnd(1, '/rooms', '/rooms'));
    view.fixture.detectChanges();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('never shows for fast page changes and leaves no timers behind', async () => {
    const { events, view } = await setup();
    events.next(new NavigationStart(1, '/'));
    events.next(new NavigationEnd(1, '/', '/'));
    await vi.advanceTimersByTimeAsync(500);
    view.fixture.detectChanges();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
