import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { VIEWPORT_NAMES } from './helpers/routes';

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== VIEWPORT_NAMES[0], 'pemeriksaan header cukup sekali');
});

function directives(policy: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of policy.split(';')) {
    const [name = '', ...values] = part.trim().split(/\s+/);
    if (name !== '') {
      map.set(name, values.join(' '));
    }
  }
  return map;
}

test.describe('header keamanan', () => {
  test('CSP ketat tanpa unsafe-inline, unsafe-eval, atau sumber luar', async ({ request }) => {
    const response = await request.get('/');
    const policy = response.headers()['content-security-policy'] ?? '';
    expect(policy).not.toBe('');
    expect(policy).not.toMatch(/unsafe-inline|unsafe-eval|https?:|\*/);
    const map = directives(policy);
    expect(map.get('default-src')).toBe("'none'");
    for (const name of ['script-src', 'style-src', 'font-src', 'connect-src']) {
      expect(map.get(name)).toBe("'self'");
    }
    expect(map.get('object-src')).toBe("'none'");
    expect(map.get('base-uri')).toBe("'none'");
    expect(map.get('form-action')).toBe("'none'");
  });

  test('frame-ancestors membatasi pembingkaian ke asal sendiri atau menolaknya', async ({
    request,
  }) => {
    const response = await request.get('/');
    const policy = directives(response.headers()['content-security-policy'] ?? '');
    expect(["'self'", "'none'"]).toContain(policy.get('frame-ancestors'));
  });

  test('X-Content-Type-Options dan Referrer-Policy terpasang', async ({ request }) => {
    const headers = (await request.get('/')).headers();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('no-referrer');
  });

  test('berkas public/_headers memuat aturan global yang sama dengan yang disajikan', async ({
    request,
  }) => {
    const text = await readFile(join(process.cwd(), 'public', '_headers'), 'utf8');
    const global = text.split(/\r?\n\r?\n/)[0] ?? '';
    expect(global.startsWith('/*')).toBe(true);
    const served = (await request.get('/')).headers();
    for (const line of global.split(/\r?\n/).slice(1)) {
      const separator = line.indexOf(':');
      const name = line.slice(0, separator).trim().toLowerCase();
      expect(served[name]).toBe(line.slice(separator + 1).trim());
    }
  });
});
