import { el, nextId } from '../dom';

export interface TabSpec {
  readonly text: string;
  readonly panel: Node;
}

export function createTabs(labelText: string, specs: readonly TabSpec[]): HTMLDivElement {
  const prefix = nextId('tabs');
  const list = el('div', {
    className: 'tabs__list',
    attrs: { role: 'tablist', 'aria-label': labelText },
  });
  const tabs: HTMLButtonElement[] = [];
  const panels: HTMLDivElement[] = [];

  const select = (index: number, focus: boolean): void => {
    tabs.forEach((tab, position) => {
      const active = position === index;
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
      panels[position]?.toggleAttribute('hidden', !active);
    });
    if (focus) {
      tabs[index]?.focus();
    }
  };

  specs.forEach((spec, index) => {
    const tabId = `${prefix}-tab-${String(index)}`;
    const panelId = `${prefix}-panel-${String(index)}`;
    const tab = el('button', {
      className: 'tabs__tab',
      text: spec.text,
      attrs: { id: tabId, role: 'tab', type: 'button', 'aria-controls': panelId },
    });
    tab.addEventListener('click', () => {
      select(index, false);
    });
    tab.addEventListener('keydown', (event) => {
      const last = specs.length - 1;
      const moves: Readonly<Record<string, number>> = {
        ArrowRight: index === last ? 0 : index + 1,
        ArrowLeft: index === 0 ? last : index - 1,
        Home: 0,
        End: last,
      };
      const target = moves[event.key];
      if (target !== undefined) {
        event.preventDefault();
        select(target, true);
      }
    });
    tabs.push(tab);
    list.append(tab);
    panels.push(
      el(
        'div',
        {
          className: 'tabs__panel',
          attrs: { id: panelId, role: 'tabpanel', 'aria-labelledby': tabId, tabindex: '0' },
        },
        spec.panel,
      ),
    );
  });

  select(0, false);
  return el('div', { className: 'tabs' }, list, ...panels);
}
