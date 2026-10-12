import { describe, expect, it } from 'vitest';
import { hasAll, noResources, parseCounts, total, transfer } from './resources';

describe('parseCounts', () => {
  it('fills missing resources with 0', () => {
    expect(parseCounts({ ore: 2 })).toEqual({ timber: 0, clay: 0, wool: 0, grain: 0, ore: 2 });
    expect(parseCounts({})).toEqual(noResources());
  });

  const bad: unknown[] = [
    null,
    undefined,
    3,
    'ore',
    [1, 2],
    { gold: 1 },
    { ore: -1 },
    { ore: 1.5 },
    { ore: '1' },
    { ore: 100 },
    { __proto__: { ore: 1 }, toString: 1 },
  ];
  it.each(bad.map((input) => [input]))('rejects %j', (input) => {
    expect(parseCounts(input)).toBeNull();
  });
});

describe('resource helpers', () => {
  it('totals, checks and transfers counts', () => {
    const hand = { ...noResources(), timber: 2, ore: 1 };
    const bank = noResources();
    expect(total(hand)).toBe(3);
    expect(hasAll(hand, { timber: 2 })).toBe(true);
    expect(hasAll(hand, { timber: 3 })).toBe(false);
    transfer(hand, bank, { timber: 2 });
    expect(hand.timber).toBe(0);
    expect(bank.timber).toBe(2);
  });
});
