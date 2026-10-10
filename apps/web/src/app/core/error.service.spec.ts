import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ToastService } from '../ui/toast/toast.service';
import { ApiError } from './api-client';
import { ErrorService } from './error.service';

describe('ErrorService', () => {
  let errors: ErrorService;
  let toasts: ToastService;
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    errors = TestBed.inject(ErrorService);
    toasts = TestBed.inject(ToastService);
    log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    toasts.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows the error as a danger toast and logs it', () => {
    errors.report(new ApiError('network', 0), { context: 'The room couldn’t be closed.' });
    expect(toasts.toasts()).toEqual([
      expect.objectContaining({
        tone: 'danger',
        message: expect.stringMatching(/^The room couldn’t be closed\. Can’t reach/),
      }),
    ]);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('logs only the code and status of API errors', () => {
    errors.report(new ApiError('rate_limited', 429));
    expect(log).toHaveBeenCalledWith('[board-table]', 'API error rate_limited (429)');
  });

  it('shows the same message only once within a few seconds', () => {
    vi.useFakeTimers();
    for (let i = 0; i < 3; i++) errors.report(new ApiError('network', 0));
    expect(toasts.toasts()).toHaveLength(1);
    toasts.clear();
    vi.advanceTimersByTime(5_000);
    errors.report(new ApiError('network', 0));
    expect(toasts.toasts()).toHaveLength(1);
  });

  it('offers to log in again when the session ended', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    errors.report(new ApiError('unauthorized', 401));
    const [toast] = toasts.toasts();
    expect(toast!.message).toMatch(/session ended/);
    expect(toast!.action?.label).toBe('Log in');
    toast!.action!.run();
    expect(navigate).toHaveBeenCalledWith('/login?next=%2F');
  });

  it('offers to reload when a newer version of the app is deployed', () => {
    errors.report(new TypeError('Failed to fetch dynamically imported module: /chunk-A.js'));
    expect(toasts.toasts()[0]!.action?.label).toBe('Reload');
  });
});
