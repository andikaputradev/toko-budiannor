import { el } from '../dom';

export interface ChipOptions {
  readonly text: string;
  readonly selected?: boolean;
  readonly onToggle?: (selected: boolean) => void;
}

export function createChip(options: ChipOptions): HTMLButtonElement {
  const chip = el('button', {
    className: 'chip',
    text: options.text,
    attrs: { type: 'button', 'aria-pressed': options.selected === true ? 'true' : 'false' },
  });
  chip.addEventListener('click', () => {
    const selected = chip.getAttribute('aria-pressed') !== 'true';
    chip.setAttribute('aria-pressed', selected ? 'true' : 'false');
    options.onToggle?.(selected);
  });
  return chip;
}
