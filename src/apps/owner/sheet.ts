import { el } from '../../shared/dom';
import { icon } from '../../shared/icons';
import { label } from '../../shared/messages';
import { createButton } from '../../shared/ui/button';
import { openModal, type ModalHandle } from '../../shared/ui/modal';

export interface SheetOptions {
  readonly title: string;
  readonly body: Node;
  readonly submitText: string;
  readonly onSubmit: () => string | undefined;
  readonly cancelText?: string | undefined;
}

export function openSheet(options: SheetOptions): ModalHandle {
  const error = el('p', { className: 'own-sheet__error', attrs: { role: 'alert' } });
  const handle = openModal({
    title: options.title,
    body: el('div', { className: 'own-sheet' }, options.body, error),
    actions: [{ text: options.cancelText ?? label('batal'), variant: 'secondary' }],
  });
  const submit = createButton({
    text: options.submitText,
    onClick: () => {
      const problem = options.onSubmit();
      if (problem === undefined) {
        handle.close();
        return;
      }
      error.replaceChildren(icon('circle-x'), el('span', { text: problem }));
    },
  });
  handle.dialog.querySelector('.modal__actions')?.append(submit);
  return handle;
}

export * from '../../shared/ui/sheet';
