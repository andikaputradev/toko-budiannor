export type RouteListener = (path: string) => void;

export function currentPath(): string {
  const hash = window.location.hash.replace(/^#/, '');
  if (hash.startsWith('/')) {
    return hash;
  }
  return hash.length > 0 ? `/${hash}` : '/';
}

export function navigate(path: string): void {
  const target = path.startsWith('/') ? `#${path}` : `#/${path}`;
  if (window.location.hash !== target) {
    window.location.hash = target;
  }
}

export function onRouteChange(listener: RouteListener): () => void {
  const onHashChange = (): void => {
    listener(currentPath());
  };
  window.addEventListener('hashchange', onHashChange);
  return () => {
    window.removeEventListener('hashchange', onHashChange);
  };
}
