import type { BuildingStyle, DistrictZone } from '../types.ts';

/**
 * Land use per district. See docs/balancing.md.
 * lot: side of a lot in cells (min, max); built: share of lots with a building on them;
 * floors: floor range, 3 m each; parks: park share as a multiple of the city's own.
 */
export interface ZoneSpec {
  readonly lot: readonly [number, number];
  readonly built: number;
  readonly floors: readonly [number, number];
  readonly parks: number;
}

export const ZONES: Record<DistrictZone, ZoneSpec> = {
  downtown: { lot: [4, 8], built: 0.85, floors: [4, 18], parks: 0.6 },
  mixed: { lot: [3, 7], built: 0.78, floors: [2, 7], parks: 1 },
  residential: { lot: [3, 4], built: 0.8, floors: [1, 2], parks: 1.4 },
  industrial: { lot: [6, 11], built: 0.75, floors: [2, 3], parks: 0.3 },
};

/**
 * No building on a lot narrower than `minSide` cells, and at most `floorsPerCell` floors per cell of
 * its narrowest side (3 floors of 3 m on 4 m: never more than 2.25 times as tall as it is wide).
 */
export const BUILDING_SHAPE = { minSide: 2, floorsPerCell: 3 } as const;

/** Downtown buildings from this many floors up are towers on a podium. */
export const TOWER_MIN_FLOORS = 9;

export function buildingStyle(zone: DistrictZone, floors: number): BuildingStyle {
  if (zone === 'industrial') return 'warehouse';
  if (zone === 'residential') return 'house';
  return zone === 'downtown' && floors >= TOWER_MIN_FLOORS ? 'tower' : 'block';
}
