import type { Meta, StoryObj } from '@storybook/angular-vite';
import { moduleMetadata } from '@storybook/angular-vite';
import { IconComponent } from '../icon/icon.component';
import { ButtonComponent } from './button.component';
import { IconButtonComponent } from './icon-button.component';

const meta: Meta = {
  title: 'UI/Button',
  decorators: [moduleMetadata({ imports: [ButtonComponent, IconButtonComponent, IconComponent] })],
};
export default meta;

export const Variants: StoryObj = {
  render: () => ({
    template: `
      <div style="display:grid;gap:var(--bt-space-6)">
        <div style="display:flex;gap:var(--bt-space-3);flex-wrap:wrap;align-items:center">
          <button bt-button><bt-icon name="play" /> Start game</button>
          <button bt-button variant="secondary"><bt-icon name="link" /> Copy invite link</button>
          <button bt-button variant="ghost">Cancel</button>
          <button bt-button variant="danger"><bt-icon name="door-open" /> Close room</button>
        </div>
        <div style="display:flex;gap:var(--bt-space-3);flex-wrap:wrap;align-items:center">
          <button bt-button size="sm">Small</button>
          <button bt-button>Medium</button>
          <button bt-button size="lg">Host a game</button>
        </div>
        <div style="display:flex;gap:var(--bt-space-3);flex-wrap:wrap;align-items:center">
          <button bt-button [loading]="true">Starting…</button>
          <button bt-button [disabled]="true">Waiting for players</button>
          <a bt-button variant="secondary" href="#">A link styled as button</a>
        </div>
        <div style="display:flex;gap:var(--bt-space-2);align-items:center">
          <button bt-icon-button icon="copy" label="Copy invite link"></button>
          <button bt-icon-button icon="arrows-clockwise" label="New invite link" variant="secondary"></button>
          <button bt-icon-button icon="trash" label="Free seat" variant="danger" size="sm"></button>
        </div>
      </div>`,
  }),
};
