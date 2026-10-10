import { render, screen } from '@testing-library/angular';
import { BadgeComponent } from './badge.component';

describe('BadgeComponent', () => {
  it('shows its text with a tone class', async () => {
    await render(`<bt-badge tone="accent">Waiting</bt-badge>`, { imports: [BadgeComponent] });
    expect(screen.getByText('Waiting').closest('bt-badge')!.classList).toContain(
      'bt-badge--accent',
    );
  });
});
