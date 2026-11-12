import { nextId } from '../../../shared/dom';

/**
 * Menautkan label.field__label ke kontrol pertama dalam .field yang sama bila belum ditautkan,
 * supaya pembaca layar dan klik pada label bekerja pada formulir yang disusun dengan el().
 */
export function linkFieldLabels(root: ParentNode): void {
  for (const field of root.querySelectorAll('.field')) {
    const caption = field.querySelector(':scope > label.field__label');
    if (caption === null || caption.hasAttribute('for')) {
      continue;
    }
    const control = field.querySelector('input, select, textarea');
    if (control === null) {
      continue;
    }
    if (control.id === '') {
      control.id = nextId('fld');
    }
    caption.setAttribute('for', control.id);
  }
}
