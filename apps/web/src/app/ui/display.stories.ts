import type { Meta, StoryObj } from '@storybook/angular-vite';
import { moduleMetadata } from '@storybook/angular-vite';
import { BadgeComponent } from './badge/badge.component';
import { ButtonComponent } from './button/button.component';
import { CardComponent } from './card/card.component';
import { EmptyStateComponent } from './empty-state/empty-state.component';
import { SkeletonComponent } from './feedback/skeleton.component';
import { SpinnerComponent } from './feedback/spinner.component';
import { IconComponent } from './icon/icon.component';
import { ICONS, type IconName } from './icon/icons';
import { SeatTokenComponent } from './seat-token/seat-token.component';

const meta: Meta = {
  title: 'UI/Display',
  decorators: [
    moduleMetadata({
      imports: [
        BadgeComponent,
        ButtonComponent,
        CardComponent,
        EmptyStateComponent,
        IconComponent,
        SeatTokenComponent,
        SkeletonComponent,
        SpinnerComponent,
      ],
    }),
  ],
};
export default meta;

export const Cards: StoryObj = {
  render: () => ({
    template: `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(16rem,1fr));gap:var(--bt-space-5)">
        <bt-card [interactive]="true">
          <div style="display:grid;gap:var(--bt-space-2)">
            <h3>Tic-tac-toe</h3>
            <p style="color:var(--bt-color-text-muted)">Three in a row wins. Quick to learn, quicker to lose.</p>
            <div style="display:flex;gap:var(--bt-space-2);margin-top:var(--bt-space-2)">
              <bt-badge><bt-icon name="users" /> 2 players</bt-badge>
              <bt-badge><bt-icon name="clock" /> 5 min</bt-badge>
              <bt-badge tone="accent">Classic</bt-badge>
            </div>
          </div>
        </bt-card>
        <bt-card>
          <div style="display:grid;gap:var(--bt-space-3)">
            <bt-skeleton height="1.5rem" width="60%" />
            <bt-skeleton />
            <bt-skeleton width="80%" />
          </div>
        </bt-card>
      </div>`,
  }),
};

export const BadgesAndStatus: StoryObj = {
  name: 'Badges & status',
  render: () => ({
    template: `
      <div style="display:grid;gap:var(--bt-space-5)">
        <div style="display:flex;gap:var(--bt-space-2);flex-wrap:wrap">
          <bt-badge>Neutral</bt-badge>
          <bt-badge tone="accent">Waiting</bt-badge>
          <bt-badge tone="warning">Starting soon</bt-badge>
          <bt-badge tone="danger">Room full</bt-badge>
        </div>
        <div style="display:flex;gap:var(--bt-space-5);align-items:center;color:var(--bt-color-text-muted)">
          <bt-spinner label="Loading" />
          <span style="display:inline-flex;gap:var(--bt-space-2);align-items:center">
            <bt-spinner size="sm" /> Waiting for the host…
          </span>
        </div>
      </div>`,
  }),
};

export const Seats: StoryObj = {
  render: () => ({
    template: `
      <div style="display:flex;gap:var(--bt-space-4);flex-wrap:wrap;align-items:center">
        <bt-seat-token [seatIndex]="0" name="Ivan Petrov" [isHost]="true" />
        <bt-seat-token [seatIndex]="1" name="Mara" [isYou]="true" />
        <bt-seat-token [seatIndex]="2" name="Theo" />
        <bt-seat-token [seatIndex]="3" name="Jun Park" [away]="true" />
        <bt-seat-token [seatIndex]="4" name="Ada" />
        <bt-seat-token [seatIndex]="5" name="Lev" />
        <bt-seat-token [seatIndex]="6" name="Ines" />
        <bt-seat-token [seatIndex]="7" name="Kai" />
        <bt-seat-token [seatIndex]="8" />
      </div>`,
  }),
};

export const Empty: StoryObj = {
  render: () => ({
    template: `
      <bt-empty-state icon="magnifying-glass" title="No games match “chess”"
        description="Try a different name, or clear the player filter.">
        <button bt-button variant="secondary">Clear search</button>
      </bt-empty-state>`,
  }),
};

export const Icons: StoryObj = {
  render: () => ({
    props: { names: Object.keys(ICONS) as IconName[] },
    template: `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(8rem,1fr));gap:var(--bt-space-3)">
        @for (name of names; track name) {
          <div style="display:flex;gap:var(--bt-space-2);align-items:center;font-size:var(--bt-text-sm)">
            <bt-icon [name]="name" style="font-size:1.25rem" /> <code>{{ name }}</code>
          </div>
        }
      </div>`,
  }),
};
