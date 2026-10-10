import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonComponent } from '../../ui/button/button.component';
import { EmptyStateComponent } from '../../ui/empty-state/empty-state.component';

@Component({
  selector: 'bt-not-found-page',
  imports: [ButtonComponent, EmptyStateComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main id="main">
      <bt-empty-state
        icon="dice-five"
        title="This page isn’t on the table"
        description="The link may be mistyped, or the room has already been cleared away."
      >
        <a bt-button variant="secondary" routerLink="/">Back to the games</a>
      </bt-empty-state>
    </main>
  `,
})
export class NotFoundPage {}
