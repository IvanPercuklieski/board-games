import { render, screen } from '@testing-library/angular';
import { SeatTokenComponent } from './seat-token.component';

describe('SeatTokenComponent', () => {
  it('shows initials and describes the seat for screen readers', async () => {
    await render(SeatTokenComponent, {
      inputs: { seatIndex: 0, name: 'Alice Smith', isHost: true, isYou: true },
    });
    expect(screen.getByText('AS')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Seat 1: Alice Smith (host, you)' })).toBeTruthy();
  });

  it('marks a player who is away', async () => {
    const { fixture } = await render(SeatTokenComponent, {
      inputs: { seatIndex: 1, name: 'Mara', away: true },
    });
    expect(screen.getByRole('img', { name: 'Seat 2: Mara (away)' })).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).classList.contains('away')).toBe(true);
  });

  it('shows a free seat', async () => {
    await render(SeatTokenComponent, { inputs: { seatIndex: 2 } });
    expect(screen.getByRole('img', { name: 'Seat 3: free' })).toBeTruthy();
  });

  it('uses one of 8 seat colours, cycling for higher seats', async () => {
    const { fixture } = await render(SeatTokenComponent, {
      inputs: { seatIndex: 9, name: 'X' },
    });
    const host = fixture.nativeElement as HTMLElement;
    expect(host.style.getPropertyValue('--bt-seat-color')).toBe('var(--bt-color-seat-1)');
  });
});
