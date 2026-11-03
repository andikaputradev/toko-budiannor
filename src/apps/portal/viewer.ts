import { el, nextId } from '../../shared/dom';
import { label } from '../../shared/messages';
import type { AppMessage } from '../../shared/simulator/review-bridge';
import { createButton } from '../../shared/ui/button';
import {
  FLOWS,
  FRAME_SIZE,
  SCREENS,
  flowById,
  openRoute,
  screenById,
  screenForHash,
  type FlowEntry,
} from './catalog';
import { createNotesPanel } from './notes-panel';

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function isAppMessage(value: unknown): value is AppMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    item['source'] === 'tbpos-app' &&
    typeof item['hash'] === 'string' &&
    typeof item['online'] === 'boolean'
  );
}

export function renderViewer(root: HTMLElement, query: URLSearchParams): () => void {
  const base = `${window.location.origin}${window.location.pathname}`;
  let flow: FlowEntry | undefined = flowById(query.get('alur'));
  const requested = Number(query.get('langkah') ?? '1');
  let step = Math.min(
    Math.max(0, (Number.isFinite(requested) ? requested : 1) - 1),
    Math.max(0, (flow?.steps.length ?? 1) - 1),
  );
  const asked = query.get('layar');
  let current =
    (asked !== null && screenById(asked) !== undefined ? asked : undefined) ??
    flow?.steps[step]?.screen ??
    SCREENS[0]?.id ??
    'POS-01';
  let online = true;
  let frame: HTMLIFrameElement | undefined;

  const titleOf = (id: string): string => {
    const entry = screenById(id);
    return entry === undefined ? '' : label(entry.title);
  };

  const screenSelectId = nextId('rev-layar');
  const flowSelectId = nextId('rev-alur');
  const screenSelect = el('select', { className: 'input', attrs: { id: screenSelectId } });
  for (const entry of SCREENS) {
    screenSelect.append(
      el('option', {
        text: `${entry.id} ${label(entry.title)}${entry.built ? '' : ` (${label('belumDibangun')})`}`,
        attrs: { value: entry.id },
      }),
    );
  }
  const flowSelect = el(
    'select',
    { className: 'input', attrs: { id: flowSelectId } },
    el('option', { text: label('tanpaAlur'), attrs: { value: '' } }),
    ...FLOWS.map((item) =>
      el('option', { text: `${item.id} ${label(item.title)}`, attrs: { value: item.id } }),
    ),
  );
  const badge = el('div', { className: 'rev-badge', attrs: { 'aria-live': 'polite' } });
  const stage = el('div', { className: 'rev-stage' });
  const wrap = el('div', { className: 'rev-frame-wrap' });
  const placeholder = el('div', { className: 'rev-placeholder', attrs: { hidden: '' } });
  const flowBox = el('section', { className: 'rev-flow' });
  const connection = createButton({ text: '', variant: 'secondary', icon: 'wifi' });

  const notes = createNotesPanel({ current: () => current, titleOf, storage: storage() });

  const send = (action: 'online' | 'reset', value?: boolean): void => {
    const target = frame?.contentWindow;
    if (target === null || target === undefined) {
      return;
    }
    target.postMessage(
      action === 'online'
        ? { source: 'tbpos-viewer', action, value: value === true }
        : { source: 'tbpos-viewer', action },
      window.location.origin,
    );
  };

  const fit = (): void => {
    const entry = screenById(current);
    const size = FRAME_SIZE[entry?.ecosystem ?? 'pos'];
    const scale = Math.min(
      1,
      Math.max(0.1, (stage.clientWidth - 24) / size.width),
      Math.max(0.1, (stage.clientHeight - 24) / size.height),
    );
    wrap.style.width = `${String(Math.round(size.width * scale))}px`;
    wrap.style.height = `${String(Math.round(size.height * scale))}px`;
    wrap.dataset['scale'] = scale.toFixed(3);
    if (frame !== undefined) {
      frame.style.width = `${String(size.width)}px`;
      frame.style.height = `${String(size.height)}px`;
      frame.style.transform = `scale(${scale.toFixed(4)})`;
    }
  };

  const updateUrl = (): void => {
    const params = new URLSearchParams();
    if (flow !== undefined) {
      params.set('alur', flow.id);
      params.set('langkah', String(step + 1));
    }
    params.set('layar', current);
    window.history.replaceState(null, '', `#/tinjau?${params.toString()}`);
  };

  const paintFlow = (): void => {
    if (flow === undefined) {
      flowBox.replaceChildren();
      return;
    }
    const active = flow;
    flowBox.replaceChildren(
      el('h2', {
        className: 't-section-title',
        text: `${label('alurJudul')} ${active.id}: ${label(active.title)}`,
      }),
      el(
        'ol',
        { className: 'rev-flow__steps' },
        ...active.steps.map((item, index) => {
          const entry = screenById(item.screen);
          const button = el('button', {
            className: 'rev-flow__step',
            text: `${item.screen}: ${label(item.text)}`,
            attrs: {
              type: 'button',
              'aria-current': index === step ? 'step' : undefined,
              'data-built': entry?.built === true ? 'true' : 'false',
            },
          });
          button.addEventListener('click', () => {
            step = index;
            go(item.screen);
          });
          return el('li', {}, button);
        }),
      ),
      el(
        'div',
        { className: 'rev-flow__nav' },
        createButton({
          text: label('langkahSebelumnya'),
          variant: 'secondary',
          disabled: step === 0,
          onClick: () => {
            step -= 1;
            go(active.steps[step]?.screen ?? current);
          },
        }),
        el('span', {
          className: 't-label',
          text: label('langkahDari', { nomor: step + 1, total: active.steps.length }),
        }),
        createButton({
          text: label('langkahBerikutnya'),
          variant: 'secondary',
          disabled: step >= active.steps.length - 1,
          onClick: () => {
            step += 1;
            go(active.steps[step]?.screen ?? current);
          },
        }),
      ),
    );
  };

  const paint = (): void => {
    const entry = screenById(current);
    badge.textContent = `${current} ${titleOf(current)}`;
    badge.dataset['screenId'] = current;
    screenSelect.value = current;
    flowSelect.value = flow?.id ?? '';
    connection.replaceChildren(
      el('span', {
        text: `${label('koneksiJudul')}: ${label(online ? 'koneksiOnline' : 'koneksiOffline')}`,
      }),
    );
    connection.setAttribute('aria-pressed', online ? 'true' : 'false');
    const built = entry?.built === true;
    placeholder.toggleAttribute('hidden', built);
    placeholder.replaceChildren(
      el('p', { text: label('layarBelumDibangun') }),
      ...(entry?.hint === undefined
        ? []
        : [el('p', { className: 't-label', text: label(entry.hint) })]),
    );
    wrap.toggleAttribute('hidden', !built);
    if (frame !== undefined) {
      frame.toggleAttribute('hidden', !built);
    }
    paintFlow();
    notes.refresh();
    fit();
    updateUrl();
  };

  const ensureFrame = (route: string): void => {
    if (frame === undefined) {
      frame = el('iframe', {
        className: 'rev-frame',
        attrs: {
          title: label('pratinjauAplikasi'),
          src: `${base}?tinjau=1#${route}`,
        },
      });
      wrap.append(frame);
      return;
    }
    const target = frame.contentWindow;
    if (target !== null && target.location.hash !== `#${route}`) {
      target.location.hash = route;
    }
  };

  const go = (id: string): void => {
    current = id;
    const entry = screenById(id);
    const route = entry === undefined ? undefined : openRoute(entry);
    if (entry?.built === true && route !== undefined) {
      ensureFrame(route);
    }
    paint();
  };

  const onMessage = (event: MessageEvent): void => {
    if (
      event.source !== frame?.contentWindow ||
      event.origin !== window.location.origin ||
      !isAppMessage(event.data)
    ) {
      return;
    }
    online = event.data.online;
    const live = event.data.overlay ?? screenForHash(event.data.hash);
    if (live !== undefined) {
      if (
        flow === undefined ||
        live === flow.steps[step]?.screen ||
        event.data.overlay !== undefined
      ) {
        current = live;
      }
    }
    paint();
  };
  window.addEventListener('message', onMessage);
  const onResize = (): void => {
    fit();
  };
  window.addEventListener('resize', onResize);
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(onResize);
  observer?.observe(stage);

  screenSelect.addEventListener('change', () => {
    go(screenSelect.value);
  });
  flowSelect.addEventListener('change', () => {
    flow = flowById(flowSelect.value === '' ? null : flowSelect.value);
    step = 0;
    go(flow?.steps[0]?.screen ?? current);
  });
  connection.addEventListener('click', () => {
    send('online', !online);
  });

  const move = (offset: number): void => {
    const index = SCREENS.findIndex((entry) => entry.id === current);
    const next = SCREENS[(index + offset + SCREENS.length) % SCREENS.length];
    if (next !== undefined) {
      go(next.id);
    }
  };

  stage.append(badge, wrap, placeholder);
  root.replaceChildren(
    el(
      'div',
      { className: 'rev' },
      el(
        'header',
        { className: 'rev-top' },
        el('a', {
          className: 'btn btn--secondary',
          text: label('kePortal'),
          attrs: { href: '#/' },
        }),
        el('h1', { className: 'rev-top__title', text: label('modeTinjau') }),
        el(
          'div',
          { className: 'field rev-top__field' },
          el('label', {
            className: 'field__label',
            text: label('pilihLayar'),
            attrs: { for: screenSelectId },
          }),
          screenSelect,
        ),
        createButton({
          text: label('layarSebelumnya'),
          variant: 'secondary',
          icon: 'chevron-left',
          onClick: () => {
            move(-1);
          },
        }),
        createButton({
          text: label('layarBerikutnya'),
          variant: 'secondary',
          onClick: () => {
            move(1);
          },
        }),
        el(
          'div',
          { className: 'field rev-top__field' },
          el('label', {
            className: 'field__label',
            text: label('pilihAlur'),
            attrs: { for: flowSelectId },
          }),
          flowSelect,
        ),
        connection,
        createButton({
          text: label('aturUlangData'),
          variant: 'secondary',
          icon: 'refresh-cw',
          onClick: () => {
            send('reset');
          },
        }),
      ),
      el(
        'main',
        { className: 'rev-main' },
        stage,
        el('aside', { className: 'rev-side' }, flowBox, notes.element),
      ),
    ),
  );
  go(current);
  return () => {
    window.removeEventListener('message', onMessage);
    window.removeEventListener('resize', onResize);
    observer?.disconnect();
  };
}
