import { showStartupError } from './startup-error';

describe('showStartupError', () => {
  afterEach(() => document.body.replaceChildren());

  it('replaces the loading screen with an explanation and a way to try again', () => {
    const root = document.createElement('app-root');
    root.innerHTML = '<p class="bt-boot">Loading board·table…</p>';
    document.body.append(root);
    const reload = vi.fn();

    showStartupError(document, reload);

    expect(root.querySelector('h1')?.textContent).toBe('board·table couldn’t start');
    expect(root.textContent).toContain('it can take a minute to wake up');
    expect(root.textContent).not.toContain('Loading');
    const button = root.querySelector('button')!;
    expect(button.textContent).toBe('Try again');
    button.click();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
