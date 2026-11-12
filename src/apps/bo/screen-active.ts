// Tab Back-Office menyimpan layar yang tidak tampil (panel `hidden`). Pendengar papan ketik global
// pada layar seperti itu tidak boleh bereaksi; layar aktif adalah yang terpasang dan tidak tersembunyi.
export function screenActive(element: HTMLElement): boolean {
  return element.isConnected && element.closest('[hidden]') === null;
}

export const CLOSE_TAB_EVENT = 'bo:close-tab';

// Layar meminta tabnya ditutup (mis. tombol Keluar pada Data Barang); workspace yang menanggapi.
export function requestCloseTab(element: HTMLElement): void {
  element.dispatchEvent(new CustomEvent(CLOSE_TAB_EVENT, { bubbles: true }));
}
