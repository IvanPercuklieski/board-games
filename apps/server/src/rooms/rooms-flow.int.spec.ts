import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createSql } from '../db';
import { testConfig } from '../testing/app';
import { devDatabaseUrl } from '../testing/dev-env';
import { connectPlayer, eventually, playMove, waitForState } from '../testing/players';
import { PostgresRoomsRepository } from './postgres-rooms-repository';
import { RoomsService } from './rooms-service';

const config = testConfig({ databaseUrl: devDatabaseUrl() });
const sql = createSql(config.databaseUrl);
const hostId = randomUUID();

afterAll(async () => {
  await sql`delete from bgio.matches where match_id in (select id from public.rooms where host_user_id = ${hostId})`;
  await sql`delete from auth.users where id = ${hostId}`; // cascades profile, rooms, seats
  await sql.end();
});

describe('rooms flow on board-games-dev', () => {
  it('create -> join -> start -> play to a win -> match is gone, room and seats stay', async () => {
    await sql`
      insert into auth.users (id, email, raw_user_meta_data, aud, role)
      values (${hostId}, ${`${hostId}@test.local`}, ${sql.json({ display_name: 'Alice' })},
              'authenticated', 'authenticated')`;
    const service = new RoomsService({
      repo: new PostgresRoomsRepository(sql),
      publicOrigin: config.publicOrigin,
    });

    const app = await createApp({ config }).start();
    try {
      const room = await service.createRoom(hostId, { gameId: 'tictactoe', maxSeats: 2 });
      const token = new URL(room.inviteUrl).hash.slice(3);
      const bobSeat = await service.join(room.roomId, { token, name: 'Bob' });
      await service.start(hostId, room.roomId);

      const alice = connectPlayer(app.url, room.roomId, {
        playerID: '0',
        credentials: room.seat.credentials,
      });
      const bob = connectPlayer(app.url, room.roomId, {
        playerID: '1',
        credentials: bobSeat.credentials,
      });
      try {
        for (const [p, cell] of [
          [alice, 0],
          [bob, 3],
          [alice, 1],
          [bob, 4],
          [alice, 2],
        ] as const) {
          await playMove(p, cell);
        }
        await waitForState(bob, (s) => s.ctx.gameover !== undefined);
      } finally {
        alice.stop();
        bob.stop();
      }

      await eventually(async () => {
        const [counts] = await sql<{ rooms: number; seats: number; matches: number }[]>`
          select
            (select count(*)::int from public.rooms where id = ${room.roomId}) as rooms,
            (select count(*)::int from public.room_seats where room_id = ${room.roomId}) as seats,
            (select count(*)::int from bgio.matches where match_id = ${room.roomId}) as matches`;
        // the match is gone; the room and its seats stay for the next game
        expect(counts).toEqual({ rooms: 1, seats: 2, matches: 0 });
      }, 10_000);
    } finally {
      await app.stop();
    }
  });
});
