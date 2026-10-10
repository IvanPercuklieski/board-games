import type { Meta, StoryObj } from '@storybook/angular-vite';
import { moduleMetadata } from '@storybook/angular-vite';
import { SegmentedComponent } from './segmented/segmented.component';
import { InputDirective, TextFieldComponent } from './text-field/text-field.component';

const meta: Meta = {
  title: 'UI/Forms',
  decorators: [
    moduleMetadata({ imports: [TextFieldComponent, InputDirective, SegmentedComponent] }),
  ],
};
export default meta;

export const Fields: StoryObj = {
  render: () => ({
    props: {
      seats: [
        { value: 2, label: '2' },
        { value: 3, label: '3' },
        { value: 4, label: '4' },
        { value: 5, label: '5' },
      ],
    },
    template: `
      <div style="display:grid;gap:var(--bt-space-6);max-width:24rem">
        <bt-text-field label="Your name" hint="Shown to the other players">
          <input btInput placeholder="e.g. Sam" />
        </bt-text-field>
        <bt-text-field label="Email" error="Enter a valid email address">
          <input btInput type="email" value="sam@" />
        </bt-text-field>
        <bt-text-field label="Search games">
          <input btInput type="search" placeholder="Name or tag" />
        </bt-text-field>
        <div style="display:grid;gap:var(--bt-space-2)">
          <span style="font-size:var(--bt-text-sm);font-weight:600">Seats</span>
          <bt-segmented label="Seats" [options]="seats" [value]="3" />
        </div>
      </div>`,
  }),
};
