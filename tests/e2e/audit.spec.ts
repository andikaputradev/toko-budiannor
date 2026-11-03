import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { artifactPath, writeJson } from './helpers/artifacts';
import { isDesignedFrame } from './helpers/frames';
import { AXE_TAGS, OVERLAYS, ROUTES, fileSafe, loginFor, openRoute } from './helpers/routes';

interface Finding {
  readonly rule: string;
  readonly impact: string | null | undefined;
  readonly help: string;
  readonly nodes: readonly { readonly target: string; readonly summary: string }[];
}

async function scan(page: Page, testInfo: TestInfo, id: string): Promise<readonly Finding[]> {
  const project = testInfo.project.name;
  await page.screenshot({ path: artifactPath('screenshots', project, `${fileSafe(id)}.png`) });
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  const findings: Finding[] = results.violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => ({
      target: node.target.join(' '),
      summary: (node.failureSummary ?? '').replace(/\s+/g, ' ').trim(),
    })),
  }));
  await writeJson(artifactPath('axe', project, `${fileSafe(id)}.json`), {
    project,
    id,
    url: page.url(),
    violations: findings,
  });
  return findings;
}

test.describe('pindai axe dan tangkapan layar seluruh rute', () => {
  for (const route of ROUTES) {
    test(`${route.id} ${route.path}`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      await openRoute(page, route);
      const findings = await scan(page, testInfo, route.id);
      expect(findings).toEqual([]);
    });
  }
});

test.describe('pindai axe lembar dan modal pada kerangka rancangannya', () => {
  for (const overlay of OVERLAYS) {
    test(overlay.id, async ({ page }, testInfo) => {
      const width = page.viewportSize()?.width;
      test.skip(
        !isDesignedFrame(overlay.app, width),
        `${overlay.id} hanya pada kerangka rancangan`,
      );
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      await loginFor(page, overlay.app);
      await overlay.open(page);
      const findings = await scan(page, testInfo, overlay.id);
      expect(findings).toEqual([]);
    });
  }
});
