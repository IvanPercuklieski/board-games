import { NavigationStart, Router, type Event } from '@angular/router';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig } from '@storybook/angular-vite';
import { BehaviorSubject } from 'rxjs';
import { NavigationProgressComponent } from './navigation-progress.component';

/** A page change that never finishes, so the bar stays visible. */
const events = new BehaviorSubject<Event>(new NavigationStart(1, '/rooms'));

const meta: Meta<NavigationProgressComponent> = {
  title: 'Shell/Navigation progress',
  component: NavigationProgressComponent,
  decorators: [applicationConfig({ providers: [{ provide: Router, useValue: { events } }] })],
};
export default meta;

export const Loading: StoryObj<NavigationProgressComponent> = {};
