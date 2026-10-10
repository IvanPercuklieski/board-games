import { TestBed } from '@angular/core/testing';
import { fireEvent, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { ConfirmService } from './confirm.service';

describe('ConfirmService', () => {
  afterEach(() => TestBed.inject(ConfirmService).closeAll());

  const ask = () =>
    TestBed.inject(ConfirmService).confirm({
      title: 'Close this room?',
      message: 'Everyone in it will be removed.',
      confirmLabel: 'Close room',
      tone: 'danger',
    });

  it('opens a labelled, described modal dialog', async () => {
    void ask();
    const dialog = await screen.findByRole('dialog', { name: 'Close this room?' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('dialog', { description: 'Everyone in it will be removed.' })).toBe(
      dialog,
    );
  });

  it('resolves true when confirmed', async () => {
    const answer = ask();
    await userEvent.click(await screen.findByRole('button', { name: 'Close room' }));
    expect(await answer).toBe(true);
  });

  it('resolves false when cancelled', async () => {
    const answer = ask();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await answer).toBe(false);
  });

  it('resolves false when dismissed with Escape', async () => {
    const answer = ask();
    const dialog = await screen.findByRole('dialog');
    // CDK reads keyCode (always set by real browsers; user-event in jsdom leaves it 0).
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape', keyCode: 27 });
    expect(await answer).toBe(false);
  });
});
