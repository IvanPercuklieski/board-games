// Database tasks for one Supabase project. No Docker needed.
// Reads DATABASE_URL only from the matching env file (parsed from the file, never the shell env):
//   dev  -> .env.dev  (board-games-dev)
//   prod -> .env.prod (board-games, the live site: only with the user's explicit go-ahead)
//
//   node scripts/db.mjs <dev|prod> test   run supabase/tests/*.test.sql (pgTAP; each file rolls back)
//   node scripts/db.mjs <dev|prod> push   apply supabase/migrations
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import postgres from 'postgres';

const target = process.argv[2];
if (target !== 'dev' && target !== 'prod') {
  console.error('Usage: node scripts/db.mjs <dev|prod> <test|push>');
  process.exit(1);
}
const envFile = `.env.${target}`;
if (!existsSync(envFile)) {
  console.error(
    `${envFile} not found. Copy .env.example to ${envFile} and fill in that project's values.`,
  );
  process.exit(1);
}
const dbUrl = parseEnv(readFileSync(envFile, 'utf8'))['DATABASE_URL'];
if (!dbUrl) {
  console.error(`DATABASE_URL is not set in ${envFile}.`);
  process.exit(1);
}

const command = process.argv[3];
console.log(`Target: ${target} (${new URL(dbUrl.replace(/^postgres(ql)?:/, 'http:')).hostname})`);

if (command === 'push') {
  const result = spawnSync('npx', ['supabase', 'db', 'push', '--db-url', dbUrl, '--yes'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  process.exit(result.status ?? 1);
} else if (command === 'test') {
  process.exit(await runTests());
} else {
  console.error('Usage: node scripts/db.mjs <dev|prod> <test|push>');
  process.exit(1);
}

async function runTests() {
  const dir = 'supabase/tests';
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.test.sql'))
    .sort();
  let failedFiles = 0;

  for (const file of files) {
    // One connection per file so an aborted transaction can't leak into the next file.
    const sql = postgres(dbUrl, { max: 1, onnotice: () => {}, prepare: false });
    const lines = [];
    let error;
    try {
      const results = await sql.unsafe(readFileSync(join(dir, file), 'utf8')).simple();
      for (const result of results) {
        for (const row of result) {
          const value = Object.values(row)[0];
          if (typeof value === 'string') lines.push(...value.split('\n'));
        }
      }
    } catch (e) {
      error = e;
    } finally {
      await sql.end({ timeout: 5 });
    }

    const tap = lines.filter((l) => /^(ok|not ok|#|\d+\.\.\d+)/.test(l));
    const passedCount = tap.filter((l) => l.startsWith('ok')).length;
    const planned = Number(tap.find((l) => /^1\.\.\d+$/.test(l))?.slice(3) ?? 0);
    const failed =
      error ||
      planned === 0 ||
      passedCount !== planned ||
      tap.some((l) => l.startsWith('not ok') || l.startsWith('# Looks like'));
    if (failed) failedFiles++;

    console.log(`${failed ? 'FAIL' : 'PASS'} ${file} (${passedCount}/${planned})`);
    for (const line of tap) {
      if (failed || line.startsWith('not ok')) console.log(`  ${line}`);
    }
    if (error) console.log(`  error: ${error.message}`);
  }

  console.log(`\n${files.length - failedFiles}/${files.length} test files passed`);
  return failedFiles === 0 ? 0 : 1;
}
