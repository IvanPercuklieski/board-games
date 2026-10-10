import { randomUUID } from 'node:crypto';
import { MemoryRoomsRepository } from '../testing/memory-rooms-repository';
import { MemoryStorage } from '../testing/memory-storage';
import { describeRoomsRepositoryContract } from './rooms-repository-contract';

describeRoomsRepositoryContract('MemoryRoomsRepository', async () => {
  const storage = new MemoryStorage();
  const repo = new MemoryRoomsRepository(storage);
  return {
    repo,
    storage,
    async createHost(displayName) {
      const id = randomUUID();
      repo.addProfile(id, displayName);
      return id;
    },
    cleanup: async () => {},
  };
});
