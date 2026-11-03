import { expect, test, type Page } from '@playwright/test';
import { isDesignedFrame } from './helpers/frames';
import { OVERLAYS, ROUTES, loginFor, openRoute } from './helpers/routes';

const MIN_SIZE = 48;
const TOLERANCE = 0.5;

const INTERACTIVE = [
  'button',
  'a[href]',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  '[role="button"]',
  '[role="tab"]',
  '[role="radio"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="link"]',
].join(',');

interface Small {
  readonly element: string;
  readonly width: number;
  readonly height: number;
}

async function undersizedTargets(page: Page): Promise<readonly Small[]> {
  return page.evaluate(
    ({ selector, min, tolerance }) => {
      const describe = (node: Element): string => {
        const name = (
          node.getAttribute('aria-label') ??
          node.getAttribute('name') ??
          node.textContent
        )
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 40);
        const classes = [...node.classList].slice(0, 2).join('.');
        return `${node.tagName.toLowerCase()}${classes === '' ? '' : `.${classes}`} "${name}"`;
      };
      const isVisible = (node: Element): boolean => {
        const style = getComputedStyle(node);
        return style.display !== 'none' && style.visibility !== 'hidden';
      };
      const inline = (node: Element): boolean =>
        node.tagName === 'A' &&
        getComputedStyle(node).display === 'inline' &&
        node.closest('p, li, dd, td, .t-body, .t-label') !== null;
      const hitArea = (node: Element): Element => {
        if (
          node instanceof HTMLInputElement &&
          (node.type === 'radio' || node.type === 'checkbox')
        ) {
          return node.closest('label') ?? node;
        }
        return node;
      };
      const found: { element: string; width: number; height: number }[] = [];
      const seen = new Set<Element>();
      for (const node of document.querySelectorAll(selector)) {
        if (!isVisible(node) || inline(node)) {
          continue;
        }
        const area = hitArea(node);
        if (seen.has(area) || !isVisible(area)) {
          continue;
        }
        seen.add(area);
        const box = area.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) {
          continue;
        }
        if (box.width < min - tolerance || box.height < min - tolerance) {
          found.push({
            element: describe(node),
            width: Math.round(box.width * 10) / 10,
            height: Math.round(box.height * 10) / 10,
          });
        }
      }
      return found;
    },
    { selector: INTERACTIVE, min: MIN_SIZE, tolerance: TOLERANCE },
  );
}

function format(small: readonly Small[]): string[] {
  return small.map((item) => `${item.element} ${String(item.width)} x ${String(item.height)}`);
}

test.describe(`target sentuh minimal ${String(MIN_SIZE)} px pada POS dan aplikasi mobile`, () => {
  for (const route of ROUTES) {
    if (route.app === 'portal' || route.app === 'bo') {
      continue;
    }
    test(`${route.id} ${route.path}`, async ({ page }) => {
      const width = page.viewportSize()?.width;
      test.skip(!isDesignedFrame(route.app, width), 'bukan kerangka rancangan aplikasi ini');
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      await openRoute(page, route);
      expect(format(await undersizedTargets(page))).toEqual([]);
    });
  }

  for (const overlay of OVERLAYS) {
    test(overlay.id, async ({ page }) => {
      const width = page.viewportSize()?.width;
      test.skip(!isDesignedFrame(overlay.app, width), 'bukan kerangka rancangan aplikasi ini');
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      await loginFor(page, overlay.app);
      await overlay.open(page);
      expect(format(await undersizedTargets(page))).toEqual([]);
    });
  }
});
