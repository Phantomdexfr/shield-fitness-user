// Setup (Phase 13): contract/engines.md section 13. One choice per axis; an omitted axis = the exercise's default. Pure.
import { z } from 'zod';

export const SETUP_AXES = ['grip', 'width', 'handle', 'position', 'arms', 'bench'] as const;
export type SetupAxis = (typeof SETUP_AXES)[number];

export const SETUP_VALUES = {
  grip: ['pronated', 'supinated', 'neutral', 'mixed', 'hammer', 'reverse'],
  width: ['wide', 'shoulder', 'narrow'],
  handle: ['straight_bar', 'ez_bar', 'curved_lat_bar', 'rope', 'v_handle', 'd_handle', 'mag_handle', 'strap', 'stirrup', 'bare_handles'],
  position: ['seated', 'standing', 'kneeling', 'half_kneeling', 'lying', 'incline', 'decline', 'leaning', 'chest_supported'],
  arms: ['both', 'single', 'alternating'],
  bench: ['none', 'flat', 'incline', 'decline', 'utility', 'preacher', 'stability_ball'],
} as const;

export const SetupSchema = z
  .object({
    grip: z.enum(SETUP_VALUES.grip),
    width: z.enum(SETUP_VALUES.width),
    handle: z.enum(SETUP_VALUES.handle),
    position: z.enum(SETUP_VALUES.position),
    arms: z.enum(SETUP_VALUES.arms),
    bench: z.enum(SETUP_VALUES.bench),
    /** Optional free input for incline/decline, 0-90 degrees. Not used for weights. */
    angleDeg: z.number().min(0).max(90),
  })
  .partial()
  .strict();

export type Setup = z.infer<typeof SetupSchema>;

/** Parse unknown data (an import, a plan envelope) into a Setup. Unknown keys or values are an error. */
export function parseSetup(input: unknown): { ok: true; value: Setup } | { ok: false; error: string } {
  const r = SetupSchema.safeParse(input);
  return r.success ? { ok: true, value: r.data } : { ok: false, error: r.error.issues[0]?.message ?? 'invalid_setup' };
}
