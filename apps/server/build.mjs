// Bundles the server (and the workspace TypeScript packages it imports, like @board-table/games)
// into dist/main.js. npm dependencies stay external and are loaded from node_modules at runtime.
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const { dependencies } = JSON.parse(readFileSync('package.json', 'utf8'));
const external = Object.keys(dependencies).filter((name) => !name.startsWith('@board-table/'));

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  external: [...external, ...external.map((name) => `${name}/*`)],
  logLevel: 'info',
});
