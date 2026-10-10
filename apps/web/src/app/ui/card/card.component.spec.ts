import { render, screen } from '@testing-library/angular';
import { CardComponent } from './card.component';

describe('CardComponent', () => {
  it('renders its content on a surface', async () => {
    await render(`<bt-card><h3>Tic-tac-toe</h3></bt-card>`, { imports: [CardComponent] });
    expect(screen.getByRole('heading', { name: 'Tic-tac-toe' })).toBeTruthy();
  });

  it('marks interactive cards for hover and focus styles', async () => {
    const { container } = await render(`<bt-card [interactive]="true">x</bt-card>`, {
      imports: [CardComponent],
    });
    expect(container.querySelector('bt-card')!.classList).toContain('bt-card--interactive');
  });
});
