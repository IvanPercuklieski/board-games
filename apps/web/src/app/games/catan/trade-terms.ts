import { hasAll, RESOURCES, totalResources, type ResourceCounts } from '@board-table/games';

/** Same checks as the rules: both sides non-empty, no resource on both, `give` in hand. */
export function termsOk(give: ResourceCounts, want: ResourceCounts, hand: ResourceCounts): boolean {
  return (
    totalResources(give) > 0 &&
    totalResources(want) > 0 &&
    !RESOURCES.some((r) => give[r] > 0 && want[r] > 0) &&
    hasAll(hand, give)
  );
}
