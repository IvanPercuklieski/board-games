import { signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { SegmentedComponent } from './segmented.component';

describe('SegmentedComponent', () => {
  const options = [
    { value: 2, label: '2' },
    { value: 3, label: '3' },
    { value: 4, label: '4' },
  ];

  it('is a labelled radio group with the current value checked', async () => {
    await render(SegmentedComponent, { inputs: { label: 'Seats', options, value: 3 } });
    expect(screen.getByRole('radiogroup', { name: 'Seats' })).toBeTruthy();
    expect((screen.getByRole('radio', { name: '3' }) as HTMLInputElement).checked).toBe(true);
  });

  it('updates the two-way value when an option is chosen', async () => {
    const value = signal(2);
    await render(`<bt-segmented label="Seats" [options]="options" [(value)]="value" />`, {
      imports: [SegmentedComponent],
      componentProperties: { options, value },
    });
    await userEvent.click(screen.getByRole('radio', { name: '4' }));
    expect(value()).toBe(4);
  });

  it('supports arrow keys like any radio group', async () => {
    const value = signal(2);
    await render(`<bt-segmented label="Seats" [options]="options" [(value)]="value" />`, {
      imports: [SegmentedComponent],
      componentProperties: { options, value },
    });
    screen.getByRole('radio', { name: '2' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(value()).toBe(3);
  });
});
