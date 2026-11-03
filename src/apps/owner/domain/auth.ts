import type { AppUser } from '../../../shared/data/types';
import type { SystemMessageId } from '../../../shared/messages';

export type OwnerLogin =
  | { readonly kind: 'ok'; readonly user: AppUser }
  | { readonly kind: 'error'; readonly messageId: SystemMessageId };

export function checkOwnerLogin(
  users: readonly AppUser[],
  username: string,
  password: string,
): OwnerLogin {
  const name = username.trim();
  if (name === '') {
    return { kind: 'error', messageId: 'MSG-052' };
  }
  if (password === '') {
    return { kind: 'error', messageId: 'MSG-053' };
  }
  const user = users.find((item) => item.username === name && item.password === password);
  if (user === undefined) {
    return { kind: 'error', messageId: 'MSG-054' };
  }
  if (!user.active) {
    return { kind: 'error', messageId: 'MSG-020' };
  }
  if (user.role !== 'owner') {
    return { kind: 'error', messageId: 'MSG-118' };
  }
  return { kind: 'ok', user };
}

export interface StoredSession {
  readonly userId: string;
  readonly expiresAt: number;
}

export interface SessionVault {
  read(): StoredSession | undefined;
  write(session: StoredSession): void;
  clear(): void;
}

const VAULT_KEY = 'tb-pos-owner-session';

export function createMemoryVault(): SessionVault {
  let value: StoredSession | undefined;
  return {
    read: () => value,
    write: (session) => {
      value = session;
    },
    clear: () => {
      value = undefined;
    },
  };
}

export function createStorageVault(storage: Storage | undefined): SessionVault {
  if (storage === undefined) {
    return createMemoryVault();
  }
  return {
    read: () => {
      try {
        const raw = storage.getItem(VAULT_KEY);
        if (raw === null) {
          return undefined;
        }
        const parsed: unknown = JSON.parse(raw);
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          'userId' in parsed &&
          'expiresAt' in parsed &&
          typeof parsed.userId === 'string' &&
          typeof parsed.expiresAt === 'number'
        ) {
          return { userId: parsed.userId, expiresAt: parsed.expiresAt };
        }
      } catch {
        return undefined;
      }
      return undefined;
    },
    write: (session) => {
      try {
        storage.setItem(VAULT_KEY, JSON.stringify(session));
      } catch {
        return;
      }
    },
    clear: () => {
      try {
        storage.removeItem(VAULT_KEY);
      } catch {
        return;
      }
    },
  };
}
