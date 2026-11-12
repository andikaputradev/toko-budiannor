import { el } from '../../shared/dom';
import { label, message } from '../../shared/messages';
import { createBanner } from '../../shared/ui/banner';
import { closeAllModals } from '../../shared/ui/modal';
import {
  closeTab,
  initialTabs,
  openTab,
  tabKey,
  tabTitleKey,
  type TabEntry,
  type TabState,
} from './domain/tabs';
import type { ScreenHandle } from './screens/login';
import { CLOSE_TAB_EVENT } from './screen-active';
import type { Shell } from './shell';
import { createTabStrip } from './tab-strip';

interface Panel {
  readonly element: HTMLElement;
  screen: ScreenHandle | undefined;
  // Naik setiap layar dibangun ulang atau panel dibuang, supaya hasil async yang basi diabaikan.
  token: number;
}

export interface Workspace {
  show(path: string): void;
  destroy(): void;
}

function titleOf(entry: TabEntry): string {
  const key = tabTitleKey(entry.path);
  return key === undefined ? (entry.key.split('/').pop() ?? entry.key) : label(key);
}

// Ruang kerja Back-Office: tab halaman di bawah header, satu panel (dengan layarnya sendiri) per tab.
// Pindah tab hanya menyembunyikan dan menampilkan panel, jadi isi layar tidak hilang.
export function createWorkspace(
  shell: Shell,
  go: (path: string) => void,
  build: (path: string) => Promise<ScreenHandle>,
): Workspace {
  const panels = new Map<string, Panel>();
  let state: TabState | undefined;
  let destroyed = false;
  let refocusTab = false;

  const strip = createTabStrip({
    onClose: (key) => {
      close(key);
    },
  });
  shell.tabsHost.append(strip.element);

  const dispose = (key: string): void => {
    const panel = panels.get(key);
    if (panel === undefined) {
      return;
    }
    panel.token += 1;
    panel.screen?.destroy();
    panel.element.remove();
    panels.delete(key);
  };

  const mountScreen = (key: string, panel: Panel, path: string): void => {
    panel.screen?.destroy();
    panel.screen = undefined;
    panel.token += 1;
    const token = panel.token;
    panel.element.replaceChildren(
      el(
        'div',
        { className: 'bo-panel bo-loading', attrs: { role: 'status' } },
        label('memuatData'),
      ),
    );
    build(path)
      .then((handle) => {
        if (destroyed || panels.get(key) !== panel || panel.token !== token) {
          handle.destroy();
          return;
        }
        panel.screen = handle;
        panel.element.replaceChildren(handle.element);
      })
      .catch(() => {
        if (!destroyed && panels.get(key) === panel && panel.token === token) {
          panel.element.replaceChildren(createBanner('danger', message('MSG-002')));
        }
      });
  };

  function close(key: string): void {
    if (state === undefined) {
      return;
    }
    const result = closeTab(state, key);
    if (result.state === state) {
      return;
    }
    state = result.state;
    dispose(key);
    strip.render(state, titleOf);
    if (result.activate === undefined) {
      strip.focusActive();
    } else {
      refocusTab = true;
      go(result.activate.path);
    }
  }

  const onCloseRequest = (event: Event): void => {
    const holder = (event.target as HTMLElement).closest<HTMLElement>('.bo-tabpanel');
    const key = holder?.dataset['tab'];
    if (key !== undefined) {
      close(key);
    }
  };
  shell.content.addEventListener(CLOSE_TAB_EVENT, onCloseRequest);

  return {
    show: (path) => {
      closeAllModals();
      let changedQuery = false;
      if (state === undefined) {
        state = initialTabs(path);
      } else {
        const result = openTab(state, path);
        state = result.state;
        changedQuery = result.changedQuery;
        result.evicted.forEach(dispose);
      }
      const key = tabKey(path);
      let panel = panels.get(key);
      if (panel === undefined) {
        panel = {
          element: el('div', { className: 'bo-tabpanel', attrs: { 'data-tab': key } }),
          screen: undefined,
          token: 0,
        };
        panels.set(key, panel);
        shell.content.append(panel.element);
        mountScreen(key, panel, path);
      } else if (changedQuery) {
        mountScreen(key, panel, path);
      }
      panels.forEach((item, itemKey) => {
        item.element.hidden = itemKey !== key;
      });
      shell.setPage(path);
      strip.render(state, titleOf);
      if (refocusTab) {
        refocusTab = false;
        strip.focusActive();
      }
    },
    destroy: () => {
      destroyed = true;
      shell.content.removeEventListener(CLOSE_TAB_EVENT, onCloseRequest);
      [...panels.keys()].forEach(dispose);
      strip.destroy();
      strip.element.remove();
    },
  };
}
