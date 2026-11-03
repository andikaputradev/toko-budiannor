import { describe, expect, it } from 'vitest';
import {
  builtIn,
  FLOWS,
  FRAME_SIZE,
  missingScreens,
  openRoute,
  SCREENS,
  screenById,
  screenForHash,
  screensIn,
} from '../../../src/apps/portal/catalog';
import { SCREEN_IDS } from '../../../src/shared/permissions';
import { label } from '../../../src/shared/messages';

describe('katalog 43 layar', () => {
  it('memuat tepat 43 layar yang sama dengan matriks izin dengan ID unik', () => {
    expect(SCREENS).toHaveLength(43);
    expect(new Set(SCREENS.map((entry) => entry.id)).size).toBe(43);
    expect([...SCREENS.map((entry) => entry.id)].sort()).toEqual([...SCREEN_IDS].sort());
  });

  it('membagi layar ke tiga ekosistem: 10 POS, 22 Back-Office, 11 mobile', () => {
    expect(screensIn('pos')).toHaveLength(10);
    expect(screensIn('bo')).toHaveLength(22);
    expect(screensIn('mobile')).toHaveLength(11);
    expect(builtIn('pos')).toBe(10);
    expect(builtIn('bo')).toBe(8);
    expect(builtIn('mobile')).toBe(11);
  });

  it('memberi judul dari katalog pesan dan menandai 14 layar belum dibangun', () => {
    for (const entry of SCREENS) {
      expect(label(entry.title).length).toBeGreaterThan(2);
    }
    const missing = SCREENS.filter((entry) => !entry.built).map((entry) => entry.id);
    expect(missing).toEqual([
      'BO-08',
      'BO-10',
      'BO-11',
      'BO-12',
      'BO-13',
      'BO-14',
      'BO-15',
      'BO-16',
      'BO-17',
      'BO-18',
      'BO-19',
      'BO-20',
      'BO-21',
      'BO-22',
    ]);
    expect(label(screenById('OWN-06')?.title ?? 'layarOwn06')).toBe('Transaksi');
  });

  it('memetakan setiap rute ke satu layar dan layar modal ke rute induknya', () => {
    const routes = SCREENS.flatMap((entry) => (entry.route === undefined ? [] : [entry.route]));
    expect(new Set(routes).size).toBe(routes.length);
    for (const entry of SCREENS) {
      if (entry.route !== undefined) {
        expect(screenForHash(`#${entry.route}`)).toBe(entry.id);
        expect(openRoute(entry)).toBe(entry.route);
      }
    }
    expect(screenForHash('#/owner/transaksi?tab=po')).toBe('OWN-06');
    expect(screenForHash('#/tidak-ada')).toBeUndefined();
    for (const id of ['POS-03', 'POS-10', 'SALES-04']) {
      const entry = screenById(id);
      expect(entry?.route).toBeUndefined();
      expect(entry?.parent).toBeDefined();
      expect(entry?.hint).toBeDefined();
      expect(entry === undefined ? undefined : openRoute(entry)).toBe(entry?.parent);
    }
  });

  it('menyediakan ukuran bingkai per ekosistem', () => {
    expect(FRAME_SIZE.pos).toEqual({ width: 1280, height: 800 });
    expect(FRAME_SIZE.bo).toEqual({ width: 1440, height: 900 });
    expect(FRAME_SIZE.mobile).toEqual({ width: 360, height: 800 });
  });
});

describe('katalog 10 alur', () => {
  it('memuat F-01 sampai F-10 dengan langkah yang merujuk layar valid', () => {
    expect(FLOWS.map((flow) => flow.id)).toEqual([
      'F-01',
      'F-02',
      'F-03',
      'F-04',
      'F-05',
      'F-06',
      'F-07',
      'F-08',
      'F-09',
      'F-10',
    ]);
    for (const flow of FLOWS) {
      expect(label(flow.title).length).toBeGreaterThan(3);
      expect(flow.steps.length).toBeGreaterThanOrEqual(2);
      for (const step of flow.steps) {
        expect(screenById(step.screen)).toBeDefined();
        expect(label(step.text).length).toBeGreaterThan(3);
      }
    }
  });

  it('menandai alur yang memakai layar belum dibangun dan alur F-09 serta F-10 lengkap', () => {
    const missing = Object.fromEntries(FLOWS.map((flow) => [flow.id, missingScreens(flow)]));
    expect(missing['F-02']).toEqual(['BO-11']);
    expect(missing['F-03']).toEqual(['BO-21']);
    expect(missing['F-07']).toEqual(['BO-12']);
    for (const id of ['F-01', 'F-04', 'F-05', 'F-06', 'F-08', 'F-09', 'F-10']) {
      expect(missing[id]).toEqual([]);
    }
  });

  it('merangkai F-09 dari Owner ke POS dan F-10 dari Sales ke BO-09 lalu kirim salinan', () => {
    const f09 = FLOWS.find((flow) => flow.id === 'F-09')?.steps.map((step) => step.screen);
    const f10 = FLOWS.find((flow) => flow.id === 'F-10')?.steps.map((step) => step.screen);
    expect(f09).toEqual(['OWN-01', 'OWN-06', 'POS-01', 'POS-05', 'POS-04', 'POS-06']);
    expect(f10).toEqual([
      'SALES-01',
      'SALES-02',
      'SALES-03',
      'SALES-05',
      'BO-01',
      'BO-09',
      'SALES-05',
    ]);
  });
});
