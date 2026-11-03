import type { AppName } from './routes';

export function isLandscapeFrame(width: number | undefined): boolean {
  return width !== undefined && width >= 1000;
}

export function isPhoneFrame(width: number | undefined): boolean {
  return width !== undefined && width <= 500;
}

/** Kerangka perangkat yang menjadi sasaran rancangan tiap aplikasi (spesifikasi bagian 2 dan 5). */
export function isDesignedFrame(app: AppName, width: number | undefined): boolean {
  if (app === 'pos' || app === 'bo') {
    return isLandscapeFrame(width);
  }
  if (app === 'owner' || app === 'sales') {
    return isPhoneFrame(width);
  }
  return true;
}
