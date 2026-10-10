import type { Meta, StoryObj } from '@storybook/angular-vite';

const meta: Meta = { title: 'Foundations' };
export default meta;

const colors = [
  ['bg', 'Page'],
  ['surface', 'Surface'],
  ['surface-raised', 'Raised'],
  ['surface-sunken', 'Sunken'],
  ['border', 'Border'],
  ['border-strong', 'Border strong'],
  ['text', 'Ink'],
  ['text-muted', 'Muted ink'],
  ['accent', 'Felt'],
  ['accent-subtle', 'Felt subtle'],
  ['accent-text', 'Felt text'],
  ['danger', 'Oxblood'],
  ['danger-subtle', 'Oxblood subtle'],
  ['warning-subtle', 'Ochre subtle'],
  ['warning-text', 'Ochre text'],
];

export const Colors: StoryObj = {
  render: () => ({
    props: { colors },
    template: `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(10rem,1fr));gap:var(--bt-space-4)">
        @for (c of colors; track c[0]) {
          <figure style="margin:0;background:var(--bt-color-surface);border:1px solid var(--bt-color-border);border-radius:var(--bt-radius-md);overflow:hidden;box-shadow:var(--bt-shadow-sm)">
            <div [style.background]="'var(--bt-color-' + c[0] + ')'" style="height:4.5rem;border-bottom:1px solid var(--bt-color-border)"></div>
            <figcaption style="padding:var(--bt-space-2) var(--bt-space-3);font-size:var(--bt-text-sm)">
              <strong>{{ c[1] }}</strong><br />
              <code style="color:var(--bt-color-text-muted)">--bt-color-{{ c[0] }}</code>
            </figcaption>
          </figure>
        }
      </div>`,
  }),
};

export const Typography: StoryObj = {
  render: () => ({
    template: `
      <div style="display:grid;gap:var(--bt-space-6);max-width:44rem">
        <h1>Gather round the table</h1>
        <h2>Pick a game, invite your friends</h2>
        <h3>Waiting for players</h3>
        <h4>Seat 2 is free</h4>
        <p>IBM Plex Sans carries the interface: buttons, forms and rules text. Fraunces gives the
          titles their warmth. Codes and links use <code>IBM Plex Mono</code>.</p>
        <p style="color:var(--bt-color-text-muted);font-size:var(--bt-text-sm)">Muted text for
          secondary details, like "2 players · about 5 minutes".</p>
        <p><a href="#">A link inside text</a></p>
      </div>`,
  }),
};

const spaces = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20];

export const SpacingAndElevation: StoryObj = {
  name: 'Spacing & elevation',
  render: () => ({
    props: { spaces, shadows: ['sm', 'md', 'lg'], radii: ['sm', 'md', 'lg', 'pill'] },
    template: `
      <div style="display:grid;gap:var(--bt-space-10)">
        <section style="display:grid;gap:var(--bt-space-2)">
          @for (s of spaces; track s) {
            <div style="display:flex;align-items:center;gap:var(--bt-space-3);font-size:var(--bt-text-sm)">
              <code style="width:7rem">--bt-space-{{ s }}</code>
              <div [style.width]="'var(--bt-space-' + s + ')'" style="height:0.75rem;background:var(--bt-color-accent);border-radius:2px"></div>
            </div>
          }
        </section>
        <section style="display:flex;gap:var(--bt-space-8);flex-wrap:wrap">
          @for (s of shadows; track s) {
            <div [style.box-shadow]="'var(--bt-shadow-' + s + ')'" style="width:9rem;height:6rem;background:var(--bt-color-surface-raised);border-radius:var(--bt-radius-md);display:grid;place-items:center">
              <code>shadow-{{ s }}</code>
            </div>
          }
        </section>
        <section style="display:flex;gap:var(--bt-space-8);flex-wrap:wrap">
          @for (r of radii; track r) {
            <div [style.border-radius]="'var(--bt-radius-' + r + ')'" style="width:9rem;height:4rem;border:2px solid var(--bt-color-border-strong);display:grid;place-items:center">
              <code>radius-{{ r }}</code>
            </div>
          }
        </section>
      </div>`,
  }),
};
