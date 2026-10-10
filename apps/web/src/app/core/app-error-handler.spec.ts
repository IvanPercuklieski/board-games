import { Component, ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  provideRouter,
  Router,
  withNavigationErrorHandler,
  withRouterConfig,
} from '@angular/router';
import { ToastService } from '../ui/toast/toast.service';
import { AppErrorHandler, reportNavigationError } from './app-error-handler';

@Component({ template: '' })
class HomeComponent {}

const chunkError = () =>
  new TypeError('Failed to fetch dynamically imported module: https://x/chunk-OLD.js');

describe('AppErrorHandler', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      providers: [
        { provide: ErrorHandler, useClass: AppErrorHandler },
        provideRouter(
          [
            { path: '', component: HomeComponent },
            { path: 'broken', loadComponent: () => Promise.reject(chunkError()) },
          ],
          withNavigationErrorHandler(reportNavigationError),
          withRouterConfig({ resolveNavigationPromiseOnError: true }),
        ),
      ],
    });
  });
  afterEach(() => {
    TestBed.inject(ToastService).clear();
    vi.restoreAllMocks();
  });

  const messages = () =>
    TestBed.inject(ToastService)
      .toasts()
      .map((t) => t.message);

  it('shows unexpected errors as one generic toast and logs them', () => {
    const error = new Error('bug');
    TestBed.inject(ErrorHandler).handleError(error);
    expect(messages()).toEqual(['Something went wrong on our side. Please try again.']);
    expect(console.error).toHaveBeenCalledWith('[board-table]', error);
  });

  it('offers to reload when a page of an older version can no longer be loaded', async () => {
    const router = TestBed.inject(Router);
    await expect(router.navigateByUrl('/broken')).resolves.toBe(false); // no second report
    const toasts = TestBed.inject(ToastService).toasts();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]!.message).toMatch(/^The page couldn’t be opened\. A new version/);
    expect(toasts[0]!.action?.label).toBe('Reload');
  });

  it('never throws, even if reporting fails', () => {
    vi.spyOn(TestBed.inject(ToastService), 'show').mockImplementation(() => {
      throw new Error('toast broke');
    });
    expect(() => TestBed.inject(ErrorHandler).handleError(new Error('bug'))).not.toThrow();
  });
});
