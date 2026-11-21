// Gym policy (Phase 66): the zod schema for `contract/policy.md`, the four-line resolution rule and the library overrides.
// Pure: no DOM, no store, no clock. docs/GYM_CONNECTION.md section 5 and 8 say what each field does on screen.

import { z } from 'zod';

const featureEntry = z.object({ enabled: z.boolean(), locked: z.boolean().optional().default(false) });
const machineEntry = z.object({ status: z.string(), note: z.string().max(200).optional() });

export const policySchema = z.object({
  contract: z.string().regex(/^\d+\.\d+\.\d+$/),
  version: z.number().int().min(0),
  published_at: z.string().max(40).optional(),
  gym: z.object({ name: z.string().min(1).max(60), slug: z.string().min(1).max(60), timezone: z.string().max(60).optional() }),
  features: z.record(featureEntry).default({}),
  defaults: z
    .object({
      units: z.string().optional(),
      rest_seconds: z.number().optional(),
      intensity: z.string().optional(),
      simple_mode: z.boolean().optional(),
    })
    .default({}),
  library: z
    .object({
      hidden_exercise_slugs: z.array(z.string()).default([]),
      youtube_overrides: z.record(z.string()).default({}),
      machine_status: z.record(machineEntry).default({}),
      extra_exercise_slugs: z.array(z.string()).default([]),
      hidden_setup_values: z.record(z.array(z.string())).default({}),
    })
    .default({}),
  programs_published: z.array(z.string()).default([]),
  branding: z.object({ short_name: z.string().nullable().optional(), support_phone_display: z.string().nullable().optional() }).default({}),
});

export type Policy = z.infer<typeof policySchema>;
export type PolicyLibrary = Policy['library'];

export type ParsePolicy = { ok: true; policy: Policy } | { ok: false };

/** Validate a policy document. Invalid = ignored by the caller (the last good one stays in force). */
export function parsePolicy(raw: unknown): ParsePolicy {
  const r = policySchema.safeParse(raw);
  return r.success ? { ok: true, policy: r.data } : { ok: false };
}

/** Which policy wins: an invalid one never replaces a good one; a lower version than the cached one is stale and ignored. */
export function chooseCurrent(current: Policy | null, incoming: unknown): { policy: Policy | null; accepted: boolean; reason: 'ok' | 'invalid' | 'stale' } {
  const p = parsePolicy(incoming);
  if (!p.ok) return { policy: current, accepted: false, reason: 'invalid' };
  if (current && p.policy.version < current.version) return { policy: current, accepted: false, reason: 'stale' };
  return { policy: p.policy, accepted: true, reason: 'ok' };
}

// ---------- features (policy.md "Resolution rule") ----------

export interface FeatureRule {
  default: boolean;
  needsConnection: boolean;
  adminLockable: boolean;
}

/**
 * 1. needsConnection features are off when standalone (no policy).
 * 2. A locked key: the admin's `enabled` wins, the user cannot change it.
 * 3. Not locked: the user's own value wins; the admin's `enabled` is only the starting value.
 * 4. Unknown keys are ignored (the caller passes no rule for them: off); a key missing from the policy uses the catalogue default.
 * A feature with `adminLockable: false` can never be locked. The gym-area ones (needsConnection) are on once connected.
 */
export function resolveFeatureValue(key: string, rule: FeatureRule | undefined, policy: Policy | null, user?: boolean): { on: boolean; locked: boolean } {
  if (!rule) return { on: false, locked: false };
  if (!policy) return { on: rule.needsConnection ? false : (user ?? rule.default), locked: false };
  const entry = policy.features[key];
  if (!rule.adminLockable) return { on: rule.needsConnection ? true : (user ?? rule.default), locked: false };
  if (entry?.locked) return { on: entry.enabled, locked: true };
  return { on: user ?? entry?.enabled ?? rule.default, locked: false };
}

// ---------- library overrides (policy.md "Library overrides") ----------

export type MachineState = 'active' | 'maintenance' | 'out_of_order';

const OWN = /^my-/;

/** The gym cannot hide a member's own `my-...` exercises. */
export function isHiddenByGym(slug: string, lib: PolicyLibrary | null | undefined): boolean {
  return !!lib && !OWN.test(slug) && lib.hidden_exercise_slugs.includes(slug);
}

export function hiddenSet(lib: PolicyLibrary | null | undefined): Set<string> {
  return new Set(lib ? lib.hidden_exercise_slugs.filter((s) => !OWN.test(s)) : []);
}

/** Only YouTube links are accepted; anything else is ignored. */
export function youtubeOverride(slug: string, lib: PolicyLibrary | null | undefined): string | undefined {
  const raw = lib?.youtube_overrides[slug];
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    const ok = u.protocol === 'https:' && !u.username && !u.password && ['www.youtube.com', 'youtube.com', 'youtu.be'].includes(u.hostname);
    return ok ? raw : undefined;
  } catch {
    return undefined;
  }
}

/** Status of a machine after the gym's override. An unknown status word counts as active. `base` is the dataset's own status. */
export function machineStateOf(slug: string, base: string, lib: PolicyLibrary | null | undefined): { status: MachineState; note?: string } {
  const e = lib?.machine_status[slug];
  const word = e ? e.status : base;
  const status: MachineState = word === 'maintenance' || word === 'out_of_order' ? word : 'active';
  return e?.note && status !== 'active' ? { status, note: e.note } : { status };
}

/** `axis:value` entries the gym removed from one exercise's setup pickers. Unknown axes and values are the caller's to ignore. */
export function hiddenSetupFor(slug: string, lib: PolicyLibrary | null | undefined): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const entry of lib?.hidden_setup_values[slug] ?? []) {
    const i = entry.indexOf(':');
    if (i <= 0 || i === entry.length - 1) continue;
    const axis = entry.slice(0, i);
    (out.get(axis) ?? out.set(axis, new Set()).get(axis)!).add(entry.slice(i + 1));
  }
  return out;
}

/** The three list overrides in one call (never edits its input). History and saved routines read exercises elsewhere and are not filtered. */
export function applyLibraryOverrides<E extends { slug: string }, M extends { slug: string; status: string }>(
  exercises: readonly E[],
  machines: readonly M[],
  lib: PolicyLibrary | null | undefined,
): { exercises: E[]; machines: Array<M & { status: MachineState; note?: string }> } {
  return {
    exercises: exercises.filter((e) => !isHiddenByGym(e.slug, lib)),
    machines: machines.map((m) => ({ ...m, ...machineStateOf(m.slug, m.status, lib) })),
  };
}
