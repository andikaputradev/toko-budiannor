import type { AppUser } from '../../../shared/data/types';
import type { SystemMessageId } from '../../../shared/messages';

export const MAX_LOGIN_FAILURES = 5;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;
export const USERNAME_PATTERN = /^[a-z0-9.]{4,30}$/;

export interface LoginGuard {
  readonly failures: number;
  readonly lockedUntil: number | undefined;
}

export const INITIAL_LOGIN_GUARD: LoginGuard = { failures: 0, lockedUntil: undefined };

export type LoginOutcome =
  | { readonly kind: 'ok'; readonly user: AppUser; readonly guard: LoginGuard }
  | { readonly kind: 'error'; readonly messageId: SystemMessageId; readonly guard: LoginGuard };

export function checkLogin(
  users: readonly AppUser[],
  username: string,
  password: string,
  guard: LoginGuard,
  now: number,
): LoginOutcome {
  const name = username.trim();
  if (name === '') {
    return { kind: 'error', messageId: 'MSG-052', guard };
  }
  if (password === '') {
    return { kind: 'error', messageId: 'MSG-053', guard };
  }
  if (guard.lockedUntil !== undefined && guard.lockedUntil > now) {
    return { kind: 'error', messageId: 'MSG-055', guard };
  }
  const current = guard.lockedUntil === undefined ? guard : INITIAL_LOGIN_GUARD;
  const user = users.find((item) => item.username === name && item.password === password);
  if (user === undefined) {
    const failures = current.failures + 1;
    if (failures >= MAX_LOGIN_FAILURES) {
      return {
        kind: 'error',
        messageId: 'MSG-055',
        guard: { failures, lockedUntil: now + LOGIN_LOCK_MS },
      };
    }
    return { kind: 'error', messageId: 'MSG-054', guard: { failures, lockedUntil: undefined } };
  }
  if (!user.active) {
    return { kind: 'error', messageId: 'MSG-020', guard: INITIAL_LOGIN_GUARD };
  }
  if (user.role === 'kasir') {
    return { kind: 'error', messageId: 'MSG-056', guard: INITIAL_LOGIN_GUARD };
  }
  if (user.role === 'frontliner' || user.role === 'sales') {
    return { kind: 'error', messageId: 'MSG-003', guard: INITIAL_LOGIN_GUARD };
  }
  return { kind: 'ok', user, guard: INITIAL_LOGIN_GUARD };
}
