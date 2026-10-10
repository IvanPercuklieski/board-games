import { createApp } from './app';
import { loadConfig } from './config';

// boardgame.io fires some socket handlers without awaiting them; a failure there (e.g. a
// database hiccup) must be logged, not crash the whole server.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason instanceof Error ? reason.message : reason);
});

async function main() {
  const config = loadConfig(process.env);
  const app = await createApp({ config }).start();
  console.log(`board-table server listening on port ${config.port}`);

  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down`);
    await app.stop();
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
