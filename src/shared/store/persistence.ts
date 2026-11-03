export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ChannelLike {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { readonly data: unknown }) => void): void;
  close(): void;
}

export interface PersistenceOptions<T> {
  readonly key: string;
  readonly parse: (raw: unknown) => T | undefined;
  readonly storage?: StorageLike | undefined;
  readonly createChannel?: ((name: string) => ChannelLike | undefined) | undefined;
}

export interface Persistence<T> {
  load(): T | undefined;
  save(value: T): boolean;
  clear(): void;
  subscribe(listener: (value: T) => void): () => void;
  close(): void;
}

export function defaultStorage(): StorageLike | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function defaultChannel(name: string): ChannelLike | undefined {
  try {
    return typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(name);
  } catch {
    return undefined;
  }
}

export function createPersistence<T>(options: PersistenceOptions<T>): Persistence<T> {
  const storage = 'storage' in options ? options.storage : defaultStorage();
  const factory = 'createChannel' in options ? options.createChannel : defaultChannel;
  const channel = factory?.(options.key);
  const listeners = new Set<(value: T) => void>();

  channel?.addEventListener('message', (event) => {
    const value = options.parse(event.data);
    if (value !== undefined) {
      for (const listener of listeners) {
        listener(value);
      }
    }
  });

  return {
    load: () => {
      try {
        const raw = storage?.getItem(options.key);
        return raw === null || raw === undefined ? undefined : options.parse(JSON.parse(raw));
      } catch {
        return undefined;
      }
    },
    save: (value) => {
      let saved = false;
      try {
        storage?.setItem(options.key, JSON.stringify(value));
        saved = storage !== undefined;
      } catch {
        saved = false;
      }
      try {
        channel?.postMessage(value);
      } catch {
        return saved;
      }
      return saved;
    },
    clear: () => {
      try {
        storage?.removeItem(options.key);
      } catch {
        return;
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close: () => {
      listeners.clear();
      channel?.close();
    },
  };
}
