import { expect, test, type Page } from '@playwright/test';
import { isDesignedFrame } from './helpers/frames';
import { ROUTES, openRoute } from './helpers/routes';

interface Stop {
  readonly index: number;
  readonly label: string;
  readonly indicator: boolean;
  readonly frame: boolean;
}

interface Walk {
  readonly stops: readonly Stop[];
  readonly closed: boolean;
}

interface Prepared {
  readonly expected: readonly string[];
  readonly positive: readonly string[];
  readonly reordered: readonly string[];
}

/** Daftar perhentian Tab menurut DOM, lalu titik mulai navigasi fokus dikembalikan ke awal dokumen. */
async function prepare(page: Page): Promise<Prepared> {
  return page.evaluate(() => {
    const isVisible = (node: Element): boolean => {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    };
    const describe = (node: Element): string => {
      const name = (node.getAttribute('aria-label') ?? node.textContent)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 30);
      return `${node.tagName.toLowerCase()}[${name}]`;
    };
    const candidates = [
      ...document.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, summary, iframe, [tabindex], [contenteditable="true"]',
      ),
    ].filter((node) => {
      return node.tabIndex >= 0 && !node.matches(':disabled') && isVisible(node);
    });
    const groups = new Set<string>();
    const all = candidates.filter((node) => {
      if (node instanceof HTMLInputElement && node.type === 'radio' && node.name !== '') {
        const key = `${node.form?.id ?? ''}:${node.name}`;
        const checked = document.querySelector(`input[type="radio"][name="${node.name}"]:checked`);
        if (groups.has(key) || (checked !== null && checked !== node)) {
          return false;
        }
        groups.add(key);
      }
      return true;
    });
    const firstFrame = all.findIndex((node) => node instanceof HTMLIFrameElement);
    const stops = firstFrame < 0 ? all : all.slice(0, firstFrame + 1);
    const reordered = stops
      .filter((node) => {
        for (
          let current: Element | null = node;
          current !== null;
          current = current.parentElement
        ) {
          const style = getComputedStyle(current);
          const parent = current.parentElement;
          const parentStyle = parent === null ? undefined : getComputedStyle(parent);
          if (
            style.order !== '0' ||
            parentStyle?.flexDirection.endsWith('reverse') === true ||
            parentStyle?.gridAutoFlow.includes('dense') === true
          ) {
            return true;
          }
        }
        return false;
      })
      .map(describe);
    Object.assign(window, { tabStops: stops });
    const probe = document.createElement('div');
    probe.tabIndex = -1;
    document.body.prepend(probe);
    probe.focus();
    probe.remove();
    return {
      expected: stops.map(describe),
      positive: candidates
        .filter((node) => node.tabIndex > 0)
        .map((node) => `${describe(node)} tabindex=${String(node.tabIndex)}`),
      reordered,
    };
  });
}

async function walk(page: Page, expected: number): Promise<Walk> {
  const stops: Stop[] = [];
  const seen = new Set<number>();
  let closed = false;
  // Kolom tanggal memakai beberapa Tab pada elemen yang sama, jadi batasnya longgar.
  for (let press = 0; press < expected * 4 + 8; press += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const active = document.activeElement;
      const list = (window as unknown as { tabStops: Element[] }).tabStops;
      if (active === null || active === document.body) {
        return undefined;
      }
      let index = list.indexOf(active);
      if (index < 0 && active instanceof HTMLInputElement && active.type === 'radio') {
        index = list.findIndex(
          (node) =>
            node instanceof HTMLInputElement && node.type === 'radio' && node.name === active.name,
        );
      }
      const style = getComputedStyle(active);
      const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
      const name = (active.getAttribute('aria-label') ?? active.textContent)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 30);
      return {
        index,
        label: `${active.tagName.toLowerCase()}[${name}]`,
        indicator: outline || style.boxShadow !== 'none',
        frame: active instanceof HTMLIFrameElement,
      };
    });
    if (stop === undefined) {
      closed = true;
      break;
    }
    if (stops.at(-1)?.index === stop.index) {
      continue;
    }
    if (seen.has(stop.index)) {
      closed = true;
      break;
    }
    seen.add(stop.index);
    stops.push(stop);
    if (stop.frame) {
      break;
    }
  }
  return { stops, closed };
}

test.describe('urutan Tab mengikuti urutan baca pada seluruh rute', () => {
  for (const route of ROUTES) {
    test(`${route.id} ${route.path}`, async ({ page }) => {
      const width = page.viewportSize()?.width;
      test.skip(!isDesignedFrame(route.app, width), 'bukan kerangka rancangan aplikasi ini');
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      await openRoute(page, route);
      const prepared = await prepare(page);
      const result = await walk(page, prepared.expected.length);
      if (process.env['TAB_DEBUG'] !== undefined) {
        console.info(
          `EXPECTED ${prepared.expected.join(' | ')}
STOPS ${result.stops.map((stop) => `${String(stop.index)}:${stop.label}`).join(' | ')}`,
        );
      }

      expect(prepared.positive, 'tabindex positif dilarang').toEqual([]);
      expect(prepared.reordered, 'tanpa CSS order atau arah balik pada jalur kontrol').toEqual([]);
      expect(result.stops.length, 'halaman harus punya perhentian Tab').toBeGreaterThan(0);

      const indices = result.stops.map((stop) => stop.index);
      expect(indices.includes(-1), 'fokus mendarat di elemen di luar daftar').toBe(false);
      expect(indices, 'urutan Tab sama dengan urutan DOM').toEqual(
        [...indices].sort((a, b) => a - b),
      );
      expect(result.stops.length, 'semua elemen yang dapat difokus terjangkau').toBe(
        prepared.expected.length,
      );

      const missing = result.stops
        .filter((stop) => !stop.indicator && !stop.frame)
        .map((stop) => stop.label);
      expect(missing, 'penanda fokus tampak').toEqual([]);
    });
  }
});
