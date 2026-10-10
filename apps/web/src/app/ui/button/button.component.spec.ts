import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { ButtonComponent } from './button.component';
import { IconButtonComponent } from './icon-button.component';

describe('ButtonComponent', () => {
  it('is a real button with its text as accessible name and a variant class', async () => {
    await render(`<button bt-button variant="danger">Close room</button>`, {
      imports: [ButtonComponent],
    });
    const button = screen.getByRole('button', { name: 'Close room' });
    expect(button.classList).toContain('bt-button--danger');
    expect(button.getAttribute('type')).toBe('button');
  });

  it('defaults to the primary variant and medium size', async () => {
    await render(`<button bt-button>Host</button>`, { imports: [ButtonComponent] });
    const classes = screen.getByRole('button').classList;
    expect(classes).toContain('bt-button--primary');
    expect(classes).toContain('bt-button--md');
  });

  it('keeps an explicit submit type', async () => {
    await render(`<button bt-button type="submit">Log in</button>`, {
      imports: [ButtonComponent],
    });
    expect(screen.getByRole('button').getAttribute('type')).toBe('submit');
  });

  it('while loading: busy, disabled, ignores clicks, keeps its name', async () => {
    const clicked = vi.fn();
    await render(`<button bt-button [loading]="true" (click)="clicked()">Start game</button>`, {
      imports: [ButtonComponent],
      componentProperties: { clicked },
    });
    const button = screen.getByRole('button', { name: /Start game/ });
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(button);
    expect(clicked).not.toHaveBeenCalled();
  });

  it('can style a link', async () => {
    await render(`<a bt-button variant="secondary" href="/rooms">My rooms</a>`, {
      imports: [ButtonComponent],
    });
    const link = screen.getByRole('link', { name: 'My rooms' });
    expect(link.classList).toContain('bt-button--secondary');
    expect(link.hasAttribute('type')).toBe(false);
  });
});

describe('IconButtonComponent', () => {
  it('uses the label as accessible name and tooltip', async () => {
    await render(`<button bt-icon-button icon="copy" label="Copy invite link"></button>`, {
      imports: [IconButtonComponent],
    });
    const button = screen.getByRole('button', { name: 'Copy invite link' });
    expect(button.getAttribute('title')).toBe('Copy invite link');
    expect(button.querySelector('svg')).toBeTruthy();
  });
});
