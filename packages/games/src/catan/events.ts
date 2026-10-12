import { RESOURCES } from './config';
import type { CatanState, GameEvent, GameEventData, ResourceCounts } from './state';

/** Enough history for a few rounds; older events are dropped so the state stays small. */
export const MAX_EVENTS = 60;

export function logEvent(G: CatanState, event: GameEventData) {
  const id = (G.events.at(-1)?.id ?? -1) + 1;
  G.events.push({ ...event, id } as GameEvent);
  if (G.events.length > MAX_EVENTS) G.events.splice(0, G.events.length - MAX_EVENTS);
}

/** Only the resources with a count (keeps log entries short). */
export function nonZero(counts: ResourceCounts): Partial<ResourceCounts> {
  return Object.fromEntries(RESOURCES.filter((r) => counts[r] > 0).map((r) => [r, counts[r]]));
}

/** What one player may see of an event: a steal's resource and a bought card stay private. */
export function eventAsSeenBy(event: GameEvent, playerID: string | null): GameEvent {
  if (event.kind === 'steal' && playerID !== event.thief && playerID !== event.victim) {
    return { ...event, resource: null };
  }
  if (event.kind === 'buyCard' && playerID !== event.player) return { ...event, card: null };
  return event;
}
