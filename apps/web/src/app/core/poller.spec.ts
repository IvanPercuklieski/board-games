import { Poller } from './poller';

describe('Poller', () => {
  let hidden = false;
  let poller: Poller | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    hidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  });
  afterEach(() => {
    poller?.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const setVisibility = (isHidden: boolean) => {
    hidden = isHidden;
    document.dispatchEvent(new Event('visibilitychange'));
  };

  it('runs immediately, then after each interval', async () => {
    const task = vi.fn(async () => undefined);
    poller = new Poller(task, 3000);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(task).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3000);
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('never overlaps: the next run waits for the previous one to finish', async () => {
    let finish: () => void = () => {};
    const task = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    poller = new Poller(task, 1000);
    poller.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(task).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('keeps polling after a failed run', async () => {
    const task = vi.fn(async () => Promise.reject(new Error('offline')));
    poller = new Poller(task, 1000);
    poller.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('pauses while the tab is hidden and catches up when it is visible again', async () => {
    const task = vi.fn(async () => undefined);
    poller = new Poller(task, 1000);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    setVisibility(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(task).toHaveBeenCalledTimes(1);
    setVisibility(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('can run on demand (e.g. right after an action)', async () => {
    const task = vi.fn(async () => undefined);
    poller = new Poller(task, 3000);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    await poller.runNow();
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('stops cleanly: no timers and no listeners left behind', async () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    const task = vi.fn(async () => undefined);
    poller = new Poller(task, 1000);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    poller.stop();
    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    await vi.advanceTimersByTimeAsync(5000);
    expect(task).toHaveBeenCalledTimes(1);
  });
});
