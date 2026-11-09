import { el } from '../../../shared/dom';
import { icon } from '../../../shared/icons';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { entryFor, groupFor } from '../domain/menu';
import type { ScreenHandle } from './login';

export function renderPlaceholder(path: string, go: (path: string) => void): ScreenHandle {
  const entry = entryFor(path);
  const group = entry ? groupFor(entry.group) : undefined;

  const titleText = entry ? label(entry.label) : label('tahapSelanjutnyaJudul');
  const groupText = group ? label(group.label) : label('backOffice');

  const card = el(
    'div',
    { className: 'bo-panel bo-placeholder-card' },
    el('div', { className: 'bo-placeholder-icon' }, icon('clock')),
    el('div', { className: 'bo-placeholder-badge', text: 'Tahap Pengerjaan' }),
    el('h2', { className: 't-section-title', text: titleText }),
    el(
      'p',
      { className: 'bo-placeholder-desc' },
      el('span', { text: `Modul: ${groupText} › ${titleText}. ` }),
      el('span', { text: label('tahapSelanjutnyaDesc') }),
    ),
    el(
      'div',
      { className: 'bo-placeholder-actions' },
      createButton({
        text: label('kembaliKeDashboard'),
        variant: 'primary',
        onClick: () => {
          go('/bo/dashboard');
        },
      }),
    ),
  );

  const element = el('div', { className: 'bo-placeholder-view' }, card);

  return {
    element,
    destroy: () => undefined,
  };
}
