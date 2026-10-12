import { RESOURCES, type Resource } from './config';
import type { ResourceCounts } from './state';

export const COSTS = {
  road: { timber: 1, clay: 1 },
  settlement: { timber: 1, clay: 1, wool: 1, grain: 1 },
  city: { grain: 2, ore: 3 },
  card: { wool: 1, grain: 1, ore: 1 },
} as const satisfies Record<string, Partial<ResourceCounts>>;

export function noResources(): ResourceCounts {
  return { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 };
}

export function isResource(value: unknown): value is Resource {
  return typeof value === 'string' && (RESOURCES as readonly string[]).includes(value);
}

export function total(counts: Partial<ResourceCounts>): number {
  return RESOURCES.reduce((sum, r) => sum + (counts[r] ?? 0), 0);
}

export function hasAll(have: ResourceCounts, need: Partial<ResourceCounts>): boolean {
  return RESOURCES.every((r) => have[r] >= (need[r] ?? 0));
}

/** Moves `counts` from one pile to another (hands and the bank are both piles). */
export function transfer(
  from: ResourceCounts,
  to: ResourceCounts,
  counts: Partial<ResourceCounts>,
) {
  for (const r of RESOURCES) {
    const n = counts[r] ?? 0;
    from[r] -= n;
    to[r] += n;
  }
}

const MAX_COUNT = 99;

/**
 * Untrusted move argument -> resource counts, or null. Accepts only an object whose keys are
 * resources and whose values are whole numbers 0-99; missing resources count as 0.
 */
export function parseCounts(input: unknown): ResourceCounts | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const counts = noResources();
  for (const [key, value] of Object.entries(input)) {
    if (!isResource(key)) return null;
    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > MAX_COUNT) {
      return null;
    }
    counts[key] = value as number;
  }
  return counts;
}
