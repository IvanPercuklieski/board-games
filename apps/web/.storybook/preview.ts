import type { Decorator, Preview } from '@storybook/angular-vite';

/** Mirrors ThemeService: "system" removes data-theme, otherwise it is set on <html>. */
const withTheme: Decorator = (story, context) => {
  const mode = context.globals['theme'] as string;
  const root = document.documentElement;
  if (mode === 'light' || mode === 'dark') root.dataset['theme'] = mode;
  else delete root.dataset['theme'];
  return story();
};

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Color mode',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'system', title: 'System' },
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'system' },
  decorators: [withTheme],
  parameters: {
    layout: 'padded',
    backgrounds: { disable: true }, // the page background comes from our tokens
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      // 'todo' shows violations in the a11y panel; stories are reviewed before each UI commit.
      test: 'todo',
    },
  },
};

export default preview;
