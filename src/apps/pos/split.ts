import { el } from '../../shared/dom';
import { label, type LabelKey } from '../../shared/messages';
import { createButton } from '../../shared/ui/button';

export type SplitPaneName = 'daftar' | 'detail';

export interface SplitPaneOptions {
  readonly list: HTMLElement;
  readonly detail: HTMLElement;
  readonly backLabel: LabelKey;
  readonly onBack?: (() => void) | undefined;
  readonly className?: string | undefined;
}

export interface SplitPane {
  readonly element: HTMLElement;
  showDetail(): void;
  showList(): void;
  currentPane(): SplitPaneName;
}

// Pola dua panel POS. Dari 900 px ke atas daftar dan detail berdampingan; di bawahnya hanya satu
// panel tampil menurut atribut data-pane, dengan tombol Kembali di atas detail.
export function createSplitPane(options: SplitPaneOptions): SplitPane {
  options.list.classList.add('pos-split__list');
  options.detail.classList.add('pos-split__detail');
  const element = el(
    'main',
    {
      className: options.className === undefined ? 'pos-split' : `pos-split ${options.className}`,
      attrs: { 'data-pane': 'daftar' },
    },
    options.list,
  );
  const show = (pane: SplitPaneName): void => {
    element.dataset['pane'] = pane;
  };
  const back = createButton({
    text: label(options.backLabel),
    variant: 'secondary',
    onClick: () => {
      show('daftar');
      options.onBack?.();
    },
  });
  back.classList.add('pos-split__back');
  element.append(back, options.detail);
  return {
    element,
    showDetail: () => {
      show('detail');
    },
    showList: () => {
      show('daftar');
    },
    currentPane: () => (element.dataset['pane'] === 'detail' ? 'detail' : 'daftar'),
  };
}
