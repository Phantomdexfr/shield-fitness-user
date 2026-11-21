export type Tier = 'clear' | 'approximate';
export interface Unit {
  /** e.g. 'male_front:traps:1' (key into html_unit_to_detailed.csv). */
  id: string;
  /** Prototype region name, e.g. 'traps'. */
  region: string;
  /** Detailed muscle id (from the CSV). */
  muscle: string;
  tier: Tier;
  /** Bounding box in viewBox units: [x, y, width, height]. */
  box: [number, number, number, number];
  d: string;
  clip?: Array<[number, number]>;
}
export interface Figure {
  outline: string;
  units: Unit[];
}
export type Sex = 'male' | 'female';
export type View = 'front' | 'back';
