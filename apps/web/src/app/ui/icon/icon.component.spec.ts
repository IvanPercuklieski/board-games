import { render, screen } from '@testing-library/angular';
import { IconComponent } from './icon.component';
import { ICONS } from './icons';

describe('IconComponent', () => {
  it('renders the named icon as decorative by default', async () => {
    const { container } = await render(IconComponent, { inputs: { name: 'check' } });
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelector('path')!.getAttribute('d')).toBe(ICONS.check);
  });

  it('is announced when it has a label', async () => {
    await render(IconComponent, { inputs: { name: 'crown', label: 'Host' } });
    expect(screen.getByRole('img', { name: 'Host' })).toBeTruthy();
  });
});
