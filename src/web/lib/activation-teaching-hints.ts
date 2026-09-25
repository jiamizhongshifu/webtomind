export type ActivationTeachingHintId = 'reference' | 'moodboard' | 'history';

const HINTS_STORAGE_KEY = 'webtomind:activation-teaching-hints:v1';
const RETURN_VISIT_STORAGE_KEY = 'webtomind:activation-return-visit:v1';
const HINTS_VERSION = 2;
const MAX_HINT_SHOWS = 2;

type StoredHints = {
  version?: number;
  seen?: ActivationTeachingHintId[];
  shows?: Partial<Record<ActivationTeachingHintId, number>>;
};

function isValidHintId(value: unknown): value is ActivationTeachingHintId {
  return value === 'reference' || value === 'moodboard' || value === 'history';
}

function readRawStoredHints(): StoredHints | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(HINTS_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as StoredHints;
  } catch {
    return null;
  }
}

function readStoredHints(): StoredHints {
  const stored = readRawStoredHints();
  const version = stored?.version;
  // A version bump resets dismissed state so redesigned hints can guide again.
  const isCurrentVersion = typeof version === 'number' && version >= HINTS_VERSION;
  return {
    version: HINTS_VERSION,
    seen: isCurrentVersion
      ? (stored?.seen || []).filter(isValidHintId)
      : [],
    shows: isCurrentVersion
      ? Object.fromEntries(
          Object.entries(stored?.shows || {}).filter(([key]) =>
            isValidHintId(key)
          )
        )
      : {}
  };
}

function writeStoredHints(hints: StoredHints): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HINTS_STORAGE_KEY, JSON.stringify(hints));
  } catch {
    // Hints are non-blocking; storage failure must not interrupt creation.
  }
}

function readSeenSet(hints: StoredHints): Set<ActivationTeachingHintId> {
  return new Set(hints.seen || []);
}

export function hasSeenActivationTeachingHint(
  hint: ActivationTeachingHintId
): boolean {
  return readSeenSet(readStoredHints()).has(hint);
}

export function markActivationTeachingHintSeen(
  hint: ActivationTeachingHintId
): void {
  const hints = readStoredHints();
  const seen = readSeenSet(hints);
  seen.add(hint);
  writeStoredHints({ ...hints, seen: [...seen] });
}

/**
 * Records one display of a hint and returns whether it may still be shown.
 * After MAX_HINT_SHOWS displays the hint is marked seen permanently, so a
 * hint can neither nag every session nor disappear after a single close.
 */
export function recordActivationTeachingHintShown(
  hint: ActivationTeachingHintId
): boolean {
  const hints = readStoredHints();
  const seen = readSeenSet(hints);
  if (seen.has(hint)) return false;
  const nextShows = (hints.shows?.[hint] || 0) + 1;
  const shows = { ...hints.shows, [hint]: nextShows };
  if (nextShows > MAX_HINT_SHOWS) {
    seen.add(hint);
  }
  writeStoredHints({ ...hints, seen: [...seen], shows });
  return nextShows <= MAX_HINT_SHOWS;
}

export function hasActivationReturnVisit(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(RETURN_VISIT_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markActivationReturnVisit(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RETURN_VISIT_STORAGE_KEY, '1');
  } catch {
    // Hints are non-blocking; storage failure must not interrupt creation.
  }
}
