export type Listener<T> = (payload: T) => void;

export interface EventBus<E extends object> {
  on<K extends keyof E>(type: K, listener: Listener<E[K]>): () => void;
  emit<K extends keyof E>(type: K, payload: E[K]): void;
  clear(): void;
}

export function createEventBus<E extends object>(): EventBus<E> {
  const registry = new Map<keyof E, Set<Listener<never>>>();
  return {
    on: (type, listener) => {
      const listeners = registry.get(type) ?? new Set<Listener<never>>();
      listeners.add(listener);
      registry.set(type, listeners);
      return () => {
        listeners.delete(listener);
      };
    },
    emit: (type, payload) => {
      for (const listener of registry.get(type) ?? []) {
        (listener as Listener<typeof payload>)(payload);
      }
    },
    clear: () => {
      registry.clear();
    },
  };
}
