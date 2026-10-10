/**
 * The app couldn't start (e.g. /api/config unreachable while the free Render instance wakes
 * up): replace the static loading screen in index.html with an explanation and Try again.
 * Plain DOM, because Angular isn't running.
 */
export function showStartupError(doc: Document, reload: () => void): void {
  const root = doc.querySelector('app-root');
  if (!root) return;

  const main = doc.createElement('main');
  main.className = 'bt-boot';
  const title = doc.createElement('h1');
  title.textContent = 'board·table couldn’t start';
  const text = doc.createElement('p');
  text.textContent =
    'Check your connection. If the site was asleep it can take a minute to wake up.';
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'bt-boot__retry';
  button.textContent = 'Try again';
  button.addEventListener('click', reload, { once: true });

  main.append(title, text, button);
  root.replaceChildren(main);
}
