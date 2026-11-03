import { expect, test } from '@playwright/test';
import { ROUTES } from './helpers/routes';

const BO_SCREENS = ROUTES.filter((route) => route.app === 'bo' && route.path !== '/bo');

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'backoffice-1440x900',
    'Back-Office dirancang untuk 1440 x 900',
  );
});

test.describe('Mode Tinjau membuka layar Back-Office langsung', () => {
  for (const route of BO_SCREENS) {
    test(`${route.id} ${route.path}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => {
        errors.push(error.message);
      });
      await page.goto(`/?tinjau=1#${route.path}`);
      await expect(page.locator('.bo-topbar')).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`#${route.path.replace(/\//g, '\/')}$`));
      expect(errors).toEqual([]);
    });
  }
});
