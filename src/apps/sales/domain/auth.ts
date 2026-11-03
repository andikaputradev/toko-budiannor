import type { AppUser } from '../../../shared/data/types';
import type { LabelKey, SystemMessageId } from '../../../shared/messages';

export type SalesLogin =
  | { readonly kind: 'ok'; readonly user: AppUser }
  | { readonly kind: 'error'; readonly messageId: SystemMessageId }
  | { readonly kind: 'label'; readonly labelKey: LabelKey };

export function checkSalesLogin(
  users: readonly AppUser[],
  username: string,
  password: string,
  online: boolean,
  known: readonly string[],
): SalesLogin {
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
  if (user.role !== 'sales') {
    return { kind: 'label', labelKey: 'hanyaSales' };
  }
  if (!online && !known.includes(user.id)) {
    return { kind: 'label', labelKey: 'masukPertamaButuhInternet' };
  }
  return { kind: 'ok', user };
}

export interface StoredSession {
  readonly userId: string;
  readonly expiresAt: number;
}

export interface SalesVault {
  read(): StoredSession | undefined;
  write(session: StoredSession): void;
  clear(): void;
  known(): readonly string[];
  remember(userId: string): void;
}

const SESSION_KEY = 'tb-pos-sales-session';
const KNOWN_KEY = 'tb-pos-sales-known';

export function createMemoryVault(): SalesVault {
  let value: StoredSession | undefined;
  let devices: readonly string[] = [];
  return {
    read: () => value,
    write: (session) => {
      value = session;
    },
    clear: () => {
      value = undefined;
    },
    known: () => devices,
    remember: (userId) => {
      devices = devices.includes(userId) ? devices : [...devices, userId];
    },
  };
}

function parseSession(raw: string | null): StoredSession | undefined {
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
  return undefined;
}

function parseKnown(raw: string | null): readonly string[] {
  if (raw === null) {
    return [];
  }
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === 'string')
    : [];
}

export function createStorageVault(storage: Storage | undefined): SalesVault {
  if (storage === undefined) {
    return createMemoryVault();
  }
  const guard = <T>(run: () => T, fallback: T): T => {
    try {
      return run();
    } catch {
      return fallback;
    }
  };
  return {
    read: () => guard(() => parseSession(storage.getItem(SESSION_KEY)), undefined),
    write: (session) => {
      guard(() => {
        storage.setItem(SESSION_KEY, JSON.stringify(session));
      }, undefined);
    },
    clear: () => {
      guard(() => {
        storage.removeItem(SESSION_KEY);
      }, undefined);
    },
    known: () => guard(() => parseKnown(storage.getItem(KNOWN_KEY)), []),
    remember: (userId) => {
      guard(() => {
        const current = parseKnown(storage.getItem(KNOWN_KEY));
        if (!current.includes(userId)) {
          storage.setItem(KNOWN_KEY, JSON.stringify([...current, userId]));
        }
      }, undefined);
    },
  };
}
