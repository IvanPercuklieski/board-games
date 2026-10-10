import { MemoryStorage } from '../testing/memory-storage';
import { describeStorageContract } from './storage-contract';

describeStorageContract('MemoryStorage', async () => ({
  db: new MemoryStorage(),
  cleanup: async () => {},
}));
