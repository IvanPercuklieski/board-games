import { randomUUID } from 'node:crypto';
import { createSql } from '../db';
import { PostgresStorage } from '../storage/postgres-storage';
import { devDatabaseUrl } from '../testing/dev-env';
import { PostgresRoomsRepository } from './postgres-rooms-repository';
import { describeRoomsRepositoryContract } from './rooms-repository-contract';

describeRoomsRepositoryContract('PostgresRoomsRepository (board-games-dev)', async () => {
  const sql = createSql(devDatabaseUrl());
  const storage = new PostgresStorage(sql);
  const repo = new PostgresRoomsRepository(sql);
  const users: string[] = [];
  return {
    repo,
    storage,
    async createHost(displayName) {
      const id = randomUUID();
      users.push(id);
      // The on_auth_user_created trigger creates the profile.
      await sql`
        insert into auth.users (id, email, raw_user_meta_data, aud, role)
        values (${id}, ${`${id}@test.local`}, ${sql.json({ display_name: displayName })},
                'authenticated', 'authenticated')`;
      return id;
    },
    async cleanup() {
      if (users.length > 0) {
        // Matches have no FK to rooms; remove them first, then the users (cascades rooms+seats).
        await sql`
          delete from bgio.matches
          where match_id in (select id from public.rooms where host_user_id = any(${users}))`;
        await sql`delete from auth.users where id = any(${users})`;
      }
      await storage.close();
      await sql.end();
    },
  };
});
