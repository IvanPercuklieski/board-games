import type { CatanEvent, CatanState } from '@board-table/games';
import { CARD, describeCounts, hexName, RESOURCE_NAME } from './catan-labels';

const AWARD = { longestTrail: 'Longest Trail', strongestGuard: 'Strongest Guard' };

/**
 * One log line, from `me`'s point of view ("You took 1 ore from Ben"). A steal's resource or a
 * bought card is null when this player isn't allowed to know it (see `eventAsSeenBy`).
 */
export function describeEvent(
  event: CatanEvent,
  G: CatanState,
  me: string,
  nameOf: (playerID: string) => string,
): string {
  const subject = (id: string) => (id === me ? 'You' : nameOf(id));
  const object = (id: string) => (id === me ? 'you' : nameOf(id));
  const one = (r: keyof typeof RESOURCE_NAME) => `1 ${RESOURCE_NAME[r].toLowerCase()}`;

  switch (event.kind) {
    case 'roll':
      return `${subject(event.player)} rolled ${event.dice[0] + event.dice[1]}`;
    case 'gain':
      return Object.entries(event.gains)
        .map(([id, counts]) => `${subject(id)} got ${describeCounts(counts)}`)
        .join('; ');
    case 'discard':
      return `${subject(event.player)} gave back ${describeCounts(event.cards)}`;
    case 'bandit':
      return `${subject(event.player)} moved the Bandit to ${hexName(G, event.hex)}`;
    case 'steal': {
      const what = event.resource ? one(event.resource) : 'a card';
      return `${subject(event.thief)} took ${what} from ${object(event.victim)}`;
    }
    case 'build': {
      const verb = event.free ? 'placed' : 'built';
      return `${subject(event.player)} ${verb} a ${event.piece}`;
    }
    case 'buyCard':
      return event.card
        ? `${subject(event.player)} bought a development card: ${CARD[event.card].name}`
        : `${subject(event.player)} bought a development card`;
    case 'playCard':
      return `${subject(event.player)} played ${CARD[event.card].name}`;
    case 'windfall': {
      const [a, b] = event.resources;
      const counts = a === b ? { [a]: 2 } : { [a]: 1, [b]: 1 };
      return `${subject(event.player)} played Windfall and took ${describeCounts(counts)}`;
    }
    case 'market':
      return (
        `${subject(event.player)} played Corner the Market and collected ` +
        describeCounts({ [event.resource]: event.total })
      );
    case 'bankTrade':
      return (
        `${subject(event.player)} traded ${describeCounts({ [event.give]: event.count })} ` +
        `for ${one(event.get)} with the bank`
      );
    case 'trade':
      return (
        `${subject(event.from)} gave ${object(event.to)} ${describeCounts(event.give)} ` +
        `for ${describeCounts(event.want)}`
      );
    case 'award':
      return event.player === null
        ? `Nobody holds ${AWARD[event.award]} now`
        : `${subject(event.player)} now ${event.player === me ? 'hold' : 'holds'} ${AWARD[event.award]}`;
  }
}
