import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ToastService } from '../ui/toast/toast.service';
import { ApiError } from './api-client';
import { asyncAction } from './async-action';

describe('asyncAction', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    TestBed.inject(ToastService).clear();
    vi.restoreAllMocks();
  });

  const make = <A extends unknown[], R>(
    task: (...args: A) => Promise<R>,
    options: Parameters<typeof asyncAction<A, R>>[1] = { context: 'It didn’t work.' },
  ) => TestBed.runInInjectionContext(() => asyncAction(task, options));
  const messages = () =>
    TestBed.inject(ToastService)
      .toasts()
      .map((t) => t.message);

  it('is busy while the task runs and returns its result', async () => {
    let finish!: (value: string) => void;
    const action = make((name: string) =>
      new Promise<string>((r) => (finish = r)).then((v) => v + name),
    );
    expect(action.busy()).toBe(false);
    const result = action.run('!');
    expect(action.busy()).toBe(true);
    finish('done');
    expect(await result).toBe('done!');
    expect(action.busy()).toBe(false);
  });

  it('ignores runs while busy (no double submits)', async () => {
    const task = vi.fn(() => new Promise<void>((r) => setTimeout(r, 10)));
    const action = make(task);
    await Promise.all([action.run(), action.run(), action.run()]);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('reports a failure as a toast with the context and stops being busy', async () => {
    const action = make(() => Promise.reject(new ApiError('network', 0)), {
      context: 'The room couldn’t be closed.',
    });
    expect(await action.run()).toBeUndefined();
    expect(action.busy()).toBe(false);
    expect(messages()).toEqual([
      expect.stringMatching(/^The room couldn’t be closed\. Can’t reach/),
    ]);
  });

  it('lets the caller show an error inline instead of a toast', async () => {
    const onError = vi.fn((e: unknown) => e instanceof ApiError && e.code === 'limit_reached');
    const action = make(() => Promise.reject(new ApiError('limit_reached', 409)), {
      context: 'No.',
      onError,
    });
    await action.run();
    expect(onError).toHaveBeenCalled();
    expect(messages()).toEqual([]);
  });

  it('still toasts errors the caller only reacted to', async () => {
    const action = make(() => Promise.reject(new ApiError('room_full', 409)), {
      context: 'You couldn’t take a seat.',
      onError: () => undefined,
    });
    await action.run();
    expect(messages()).toHaveLength(1);
  });
});
