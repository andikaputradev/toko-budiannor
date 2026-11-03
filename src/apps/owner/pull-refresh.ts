import { PULL_THRESHOLD } from './domain/constants';

export function pullDistance(startY: number, currentY: number, scrollTop: number): number {
  if (scrollTop > 0) {
    return 0;
  }
  return Math.max(0, Math.min(currentY - startY, PULL_THRESHOLD * 2));
}

export function shouldRefresh(distance: number): boolean {
  return distance >= PULL_THRESHOLD;
}

export interface PullOptions {
  readonly target: HTMLElement;
  readonly indicator: HTMLElement;
  readonly onRefresh: () => void;
}

export function attachPull(options: PullOptions): () => void {
  const { target, indicator } = options;
  let startY: number | undefined;
  let distance = 0;

  const paint = (value: number): void => {
    indicator.style.height = `${String(Math.round(value / 2))}px`;
    indicator.classList.toggle('is-ready', shouldRefresh(value));
  };
  const begin = (event: TouchEvent): void => {
    startY = target.scrollTop <= 0 ? event.touches[0]?.clientY : undefined;
    distance = 0;
  };
  const move = (event: TouchEvent): void => {
    const touch = event.touches[0];
    if (startY === undefined || touch === undefined) {
      return;
    }
    distance = pullDistance(startY, touch.clientY, target.scrollTop);
    paint(distance);
  };
  const end = (): void => {
    const ready = shouldRefresh(distance);
    startY = undefined;
    distance = 0;
    paint(0);
    if (ready) {
      options.onRefresh();
    }
  };
  target.addEventListener('touchstart', begin, { passive: true });
  target.addEventListener('touchmove', move, { passive: true });
  target.addEventListener('touchend', end);
  target.addEventListener('touchcancel', end);
  return () => {
    target.removeEventListener('touchstart', begin);
    target.removeEventListener('touchmove', move);
    target.removeEventListener('touchend', end);
    target.removeEventListener('touchcancel', end);
  };
}
