import type { SessionPlayer } from '../game-client/game-session';

/**
 * Human wording for boardgame.io's conventional gameover values:
 * `{ winner: playerID }` or `{ draw: true }`. Anything else is just "Game over".
 */
export function describeGameOver(gameover: unknown, players: readonly SessionPlayer[]): string {
  if (typeof gameover !== 'object' || gameover === null) return 'Game over';
  if ('draw' in gameover && gameover.draw === true) return 'It’s a draw';
  if ('winner' in gameover && typeof gameover.winner === 'string') {
    const winner = players.find((p) => p.playerID === gameover.winner);
    if (winner?.isYou) return 'You won!';
    if (winner) return `${winner.name} won`;
  }
  return 'Game over';
}
