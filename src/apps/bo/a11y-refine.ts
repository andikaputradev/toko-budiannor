import { nextId } from '../../shared/dom';
import { label } from '../../shared/messages';

const FOCUSABLE =
  ':is(a[href], button, input, select, textarea, summary):not(:disabled), [tabindex]:not([tabindex="-1"])';
const CONTAINERS = 'div, section, aside, article, ul, ol, dl, nav, form, fieldset';
const HEADINGS = 'h1, h2, h3, h4';

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

// Pilihan filter tanpa label diberi nama dari opsi pertamanya ("Semua Sumber", "Semua Status").
function nameBareSelects(root: ParentNode): void {
  for (const select of root.querySelectorAll('select')) {
    const named =
      select.hasAttribute('aria-label') ||
      select.hasAttribute('aria-labelledby') ||
      select.hasAttribute('title') ||
      select.labels.length > 0;
    const first = select.options[0]?.textContent;
    if (!named && first !== undefined && first !== '') {
      select.setAttribute('aria-label', first);
    }
  }
}

// Kontrol yang sudah tampak di dalam kotak area (tanpa digulir) cukup untuk menjangkaunya dengan Tab.
function hasVisibleFocusable(node: HTMLElement): boolean {
  const box = node.getBoundingClientRect();
  return [...node.querySelectorAll(FOCUSABLE)].some((item) => {
    const rect = item.getBoundingClientRect();
    return rect.height > 0 && rect.top >= box.top && rect.bottom <= box.bottom;
  });
}

function regionName(node: HTMLElement): string {
  const own = node.querySelector(HEADINGS)?.textContent;
  const sibling = node.previousElementSibling;
  const before = sibling?.matches(HEADINGS) === true ? sibling.textContent : undefined;
  const parentHeading = node.parentElement?.querySelector(`:scope > ${HEADINGS}`)?.textContent;
  const text = [own, before, parentHeading].find(
    (item) => item !== undefined && item.trim() !== '',
  );
  return text?.trim() ?? label('boAreaGulir');
}

// Area yang menggulir di dalam panelnya dan tidak memuat kontrol harus bisa dijangkau papan ketik
// (axe: scrollable-region-focusable). Hanya yang benar-benar meluap saat ini yang ditandai.
function focusScrollRegions(root: HTMLElement): void {
  if (root.hidden) {
    return;
  }
  for (const node of root.querySelectorAll<HTMLElement>(CONTAINERS)) {
    if (node.hasAttribute('tabindex') || node.scrollHeight <= node.clientHeight + 1) {
      continue;
    }
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow !== 'auto' && overflow !== 'scroll') || hasVisibleFocusable(node)) {
      continue;
    }
    node.tabIndex = 0;
    node.setAttribute('role', 'region');
    node.setAttribute('aria-label', regionName(node));
  }
}

// Dipanggil workspace untuk panel layar BO sesudah dibangun, saat isinya berubah, dan saat ukuran
// jendela berubah.
export function refineA11y(root: HTMLElement): void {
  linkFieldLabels(root);
  nameBareSelects(root);
  focusScrollRegions(root);
}
