import { render, screen } from '@testing-library/angular';
import { EmptyStateComponent } from './empty-state.component';

describe('EmptyStateComponent', () => {
  it('shows a title, description and projected actions', async () => {
    await render(
      `<bt-empty-state icon="magnifying-glass" title="No games found" description="Try another name.">
        <button>Clear search</button>
      </bt-empty-state>`,
      { imports: [EmptyStateComponent] },
    );
    expect(screen.getByRole('heading', { name: 'No games found' })).toBeTruthy();
    expect(screen.getByText('Try another name.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeTruthy();
  });
});
