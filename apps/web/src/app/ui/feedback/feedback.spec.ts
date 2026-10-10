import { render, screen } from '@testing-library/angular';
import { SkeletonComponent } from './skeleton.component';
import { SpinnerComponent } from './spinner.component';

describe('SpinnerComponent', () => {
  it('announces its label as a status', async () => {
    await render(SpinnerComponent, { inputs: { label: 'Loading games' } });
    expect(screen.getByRole('status').textContent).toContain('Loading games');
  });
});

describe('SkeletonComponent', () => {
  it('is hidden from assistive technology', async () => {
    const { fixture } = await render(SkeletonComponent);
    expect((fixture.nativeElement as HTMLElement).getAttribute('aria-hidden')).toBe('true');
  });
});
