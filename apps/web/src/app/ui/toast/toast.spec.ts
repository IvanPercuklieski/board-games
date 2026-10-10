import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { ToastOutletComponent } from './toast-outlet.component';
import { ToastService } from './toast.service';

describe('toasts', () => {
  afterEach(() => {
    TestBed.inject(ToastService).clear();
    vi.useRealTimers();
  });

  it('shows messages in a polite live region and dismisses them', async () => {
    await render(ToastOutletComponent);
    const toasts = TestBed.inject(ToastService);
    toasts.show({ message: 'Invite link copied', tone: 'success' });
    const region = screen.getByRole('region', { name: 'Notifications' });
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(await screen.findByText('Invite link copied')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Invite link copied')).toBeNull();
  });

  it('announces errors right away', async () => {
    await render(ToastOutletComponent);
    TestBed.inject(ToastService).show({ message: 'The room couldn’t be closed.', tone: 'danger' });
    expect((await screen.findByRole('alert')).textContent).toContain(
      'The room couldn’t be closed.',
    );
  });

  it('runs a toast’s action and dismisses it', async () => {
    await render(ToastOutletComponent);
    const run = vi.fn();
    TestBed.inject(ToastService).show({
      message: 'A new version is available.',
      action: { label: 'Reload', run },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Reload' }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('A new version is available.')).toBeNull();
  });

  it('removes a toast after its duration and leaves no timers behind', () => {
    vi.useFakeTimers();
    const toasts = TestBed.inject(ToastService);
    toasts.show({ message: 'Saved', durationMs: 1000 });
    expect(toasts.toasts()).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(toasts.toasts()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps at most 3 toasts and clears timers of dropped ones', () => {
    vi.useFakeTimers();
    const toasts = TestBed.inject(ToastService);
    for (let i = 0; i < 5; i++) toasts.show({ message: `m${i}` });
    expect(toasts.toasts().map((t) => t.message)).toEqual(['m2', 'm3', 'm4']);
    expect(vi.getTimerCount()).toBe(3);
  });
});
