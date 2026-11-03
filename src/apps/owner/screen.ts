export interface ScreenHandle {
  readonly element: HTMLElement;
  destroy(): void;
}

export function dueText(text: string): string {
  const parts = text.split(' ');
  return `${(parts[0] ?? '').padStart(2, '0')} ${parts.slice(1).join(' ')}`;
}

export * from '../../shared/ui/screen';
