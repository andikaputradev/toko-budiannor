import type { AppUser } from '../../../shared/data/types';

export const MAX_PIN_FAILURES = 3;
export const LOCK_MS = 5 * 60 * 1000;
export const PIN_PATTERN = /^\d{6}$/;

export interface PinGuard {
  readonly failures: number;
  readonly lockedUntil: number | undefined;
}

export const INITIAL_GUARD: PinGuard = { failures: 0, lockedUntil: undefined };

export type PinOutcome =
  | { readonly kind: 'invalid-format'; readonly guard: PinGuard }
  | { readonly kind: 'success'; readonly guard: PinGuard }
  | { readonly kind: 'wrong'; readonly remaining: number; readonly guard: PinGuard }
  | { readonly kind: 'locked'; readonly retryAfterMs: number; readonly guard: PinGuard };

export function checkPin(
  expected: string,
  entered: string,
  guard: PinGuard,
  now: number,
): PinOutcome {
  if (guard.lockedUntil !== undefined && guard.lockedUntil > now) {
    return { kind: 'locked', retryAfterMs: guard.lockedUntil - now, guard };
  }
  const current = guard.lockedUntil === undefined ? guard : INITIAL_GUARD;
  if (!PIN_PATTERN.test(entered)) {
    return { kind: 'invalid-format', guard: current };
  }
  if (entered === expected) {
    return { kind: 'success', guard: INITIAL_GUARD };
  }
  const failures = current.failures + 1;
  if (failures >= MAX_PIN_FAILURES) {
    const lockedUntil = now + LOCK_MS;
    return {
      kind: 'locked',
      retryAfterMs: LOCK_MS,
      guard: { failures, lockedUntil },
    };
  }
  return {
    kind: 'wrong',
    remaining: MAX_PIN_FAILURES - failures,
    guard: { failures, lockedUntil: undefined },
  };
}

export function ownerPinOwner(users: readonly AppUser[], entered: string): AppUser | undefined {
  return users.find((user) => user.role === 'owner' && user.active && user.pin === entered);
}

export function pinBelongsToNonOwner(users: readonly AppUser[], entered: string): boolean {
  return users.some((user) => user.role !== 'owner' && user.pin === entered);
}

export * from '../../../shared/domain/pin';
