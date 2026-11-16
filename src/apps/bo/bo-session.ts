import { createEventBus } from '../../shared/store/event-bus';
import { isAllowed } from '../../shared/permissions';
import type { AppUser, Product, WarehouseId } from '../../shared/data/types';
import { round3, toBase } from '../../shared/data/units';
import type { SystemMessageId } from '../../shared/messages';
import type { Store } from '../../shared/store/store';
import { checkLogin, INITIAL_LOGIN_GUARD, type LoginGuard } from './domain/auth';
import {
  belowHpp,
  buildUnits,
  describeChanges,
  validatePricing,
  type PriceRow,
  type PricingIssue,
} from './domain/pricing';
import {
  buildProduct,
  nextProductId,
  validateProduct,
  type ProductDraft,
  type ProductIssue,
} from './domain/product-form';
import {
  difference,
  filledCount,
  formatOrderNumber,
  isComplete,
  nextSequence,
  parsePhysical,
  seedOpnameOrders,
  systemStock,
  validateResult,
  type OpnameLine,
  type OpnameOrder,
} from './domain/opname';
import { parseQuantity, validateTransfer, type TransferLineDraft } from './domain/transfer';

export const BO_DEVICE = 'Back-Office PC';
export const BO_IP = '192.168.1.20';

export interface TransferLineDoc {
  readonly productId: string;
  readonly code: string;
  readonly name: string;
  readonly unit: string;
  readonly quantity: number;
  readonly baseQuantity: number;
}

export interface TransferDoc {
  readonly number: string;
  readonly at: string;
  readonly userId: string;
  readonly from: WarehouseId;
  readonly to: WarehouseId;
  readonly note: string;
  readonly lines: readonly TransferLineDoc[];
}

export interface BoState {
  readonly user: AppUser | undefined;
  readonly transfers: readonly TransferDoc[];
  // Riwayat Stok Opname: semua perintah (PSO) beserta hasilnya (HSO), terbaru di akhir.
  readonly opnameOrders: readonly OpnameOrder[];
  // Perintah baru yang sedang disusun (belum disimpan).
  readonly opnameDraft: OpnameOrder;
}

export interface Failure {
  readonly ok: false;
  readonly messageId: SystemMessageId;
  readonly values: Readonly<Record<string, string>>;
  readonly line?: number | undefined;
  readonly productId?: string | undefined;
}

export interface Done {
  readonly ok: true;
}

export type ProductResult =
  | { readonly ok: true; readonly product: Product }
  | { readonly ok: false; readonly issue: ProductIssue }
  | Failure;

export type PricingResult =
  | Done
  | { readonly ok: false; readonly kind: 'issue'; readonly issue: PricingIssue }
  | { readonly ok: false; readonly kind: 'confirm'; readonly rows: readonly number[] }
  | { readonly ok: false; readonly kind: 'denied'; readonly messageId: SystemMessageId };

export type TransferResult = { readonly ok: true; readonly number: string } | Failure;

export interface OpnameHeaderPatch {
  readonly date?: string;
  readonly resultDate?: string;
  readonly officerId?: string;
  readonly warehouse?: WarehouseId;
  readonly note?: string;
}

// Perintah tanpa barang ditolak dengan `empty`: tidak ada kode pesan sistem yang cocok untuk kasus ini.
export interface OpnameEmpty {
  readonly ok: false;
  readonly empty: true;
}

export type OpnameSaveResult =
  | { readonly ok: true; readonly pso: string; readonly status: OpnameOrder['status'] }
  | Failure
  | OpnameEmpty;

export interface BoSession {
  readonly store: Store;
  now(): Date;
  state(): BoState;
  subscribe(listener: (state: BoState) => void): () => void;
  allowed(screen: string, action: string): boolean;
  login(username: string, password: string): Done | Failure;
  logout(): void;
  saveProduct(draft: ProductDraft, editingId: string | undefined): ProductResult;
  deactivateProduct(id: string): Done | Failure;
  savePricing(productId: string, rows: readonly PriceRow[], confirmed: boolean): PricingResult;
  markReviewed(productId: string): Done | Failure;
  saveTransfer(
    from: WarehouseId,
    to: WarehouseId,
    lines: readonly TransferLineDraft[],
    note?: string,
  ): TransferResult;
  // Stok Opname dua tahap. `pso` kosong berarti perintah baru yang masih berupa draf.
  newOpnameDraft(): void;
  editOpname(pso: string | undefined, patch: OpnameHeaderPatch): void;
  addOpnameProducts(pso: string | undefined, products: readonly Product[]): number;
  removeOpnameLine(pso: string | undefined, productId: string): void;
  saveOpnameOrder(pso: string | undefined): OpnameSaveResult;
  startOpnameCount(pso: string): OpnameSaveResult;
  setPhysical(pso: string, productId: string, value: string): void;
  saveOpnameResult(pso: string): OpnameSaveResult;
  printInvoiceCopy(number: string): Done | Failure;
}

export interface BoSessionOptions {
  readonly clock?: () => number;
}

function freshOpnameDraft(
  orders: readonly OpnameOrder[],
  date: string,
  officerId: string,
): OpnameOrder {
  return {
    pso: formatOrderNumber('PSO', nextSequence(orders, 'PSO')),
    hso: undefined,
    warehouse: 'display',
    date,
    resultDate: undefined,
    officerId,
    note: '',
    lines: [],
    status: 'menunggu',
    appliedBy: undefined,
    journalValue: 0,
  };
}

export function createBoSession(store: Store, options: BoSessionOptions = {}): BoSession {
  const clock = options.clock ?? (() => Date.now());
  const bus = createEventBus<{ change: BoState }>();
  const startedAt = clock();
  const baseMs = Date.parse(store.getState().data.referenceDate);
  const now = (): Date => new Date(baseMs + (clock() - startedAt));
  const stamp = (): string => now().toISOString();
  const today = (): string =>
    new Date(now().getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const seed = (): readonly TransferDoc[] => {
    const first = store.getState().data.products[0];
    return first === undefined
      ? []
      : [
          {
            number: 'M-0001',
            at: '2026-10-18T04:10:00.000Z',
            userId: 'U-2',
            from: 'besar',
            to: 'display',
            note: 'Isi stok toko',
            lines: [
              {
                productId: first.id,
                code: first.code,
                name: first.name,
                unit: first.baseUnit,
                quantity: 40,
                baseQuantity: 40,
              },
            ],
          },
        ];
  };

  const history = (): readonly OpnameOrder[] => {
    const data = store.getState().data;
    return seedOpnameOrders(data.products, data.users);
  };
  const draftFor = (orders: readonly OpnameOrder[]): OpnameOrder =>
    freshOpnameDraft(orders, today(), store.getState().userId);
  let state: BoState = {
    user: undefined,
    transfers: seed(),
    opnameOrders: history(),
    opnameDraft: draftFor(history()),
  };
  const guards = new Map<string, LoginGuard>();

  const commit = (next: Partial<BoState>): void => {
    state = { ...state, ...next };
    bus.emit('change', state);
  };
  store.bus.on('reset', () => {
    const past = history();
    state = {
      user: state.user,
      transfers: seed(),
      opnameOrders: past,
      opnameDraft: draftFor(past),
    };
    bus.emit('change', state);
  });

  const role = () => store.getState().role;
  const lookup = (id: string): Product | undefined =>
    store.getState().data.products.find((item) => item.id === id);
  const userId = (): string => state.user?.id ?? store.getState().userId;
  const log = (kind: Parameters<Store['logActivity']>[0]['kind'], detail: string): void => {
    store.logActivity({
      at: stamp(),
      userId: userId(),
      device: BO_DEVICE,
      ip: BO_IP,
      kind,
      detail,
    });
  };
  const fail = (
    messageId: SystemMessageId,
    values: Readonly<Record<string, string>> = {},
    extra: { line?: number | undefined; productId?: string | undefined } = {},
  ): Failure => ({ ok: false, messageId, values, ...extra });

  // Perubahan pada perintah baru (draf) atau perintah tersimpan; perintah selesai tidak berubah.
  const changeOpname = (
    pso: string | undefined,
    change: (order: OpnameOrder) => OpnameOrder,
  ): void => {
    if (pso === undefined) {
      commit({ opnameDraft: change(state.opnameDraft) });
      return;
    }
    const existing = state.opnameOrders.find((order) => order.pso === pso);
    if (existing === undefined || existing.status === 'selesai') {
      return;
    }
    commit({
      opnameOrders: state.opnameOrders.map((order) => (order.pso === pso ? change(order) : order)),
    });
  };
  const orderOf = (pso: string | undefined): OpnameOrder | undefined =>
    pso === undefined ? state.opnameDraft : state.opnameOrders.find((order) => order.pso === pso);

  return {
    store,
    now,
    state: () => state,
    subscribe: (listener) => bus.on('change', listener),
    allowed: (screen, action) => isAllowed(role(), screen, action),
    login: (username, password) => {
      if (!store.getState().online) {
        return fail('MSG-001');
      }
      const key = username.trim().toLowerCase();
      const outcome = checkLogin(
        store.getState().data.users,
        username.trim(),
        password,
        guards.get(key) ?? INITIAL_LOGIN_GUARD,
        clock(),
      );
      guards.set(key, outcome.guard);
      if (outcome.kind === 'error') {
        return fail(outcome.messageId);
      }
      // Pengguna dicatat lebih dulu: setUser memicu mount ulang, dan mount menganggap sesi
      // belum masuk (lalu masuk otomatis lagi pada Mode Tinjau) bila pengguna belum ada.
      commit({ user: outcome.user });
      store.setUser(outcome.user.id);
      log('masuk', `Masuk Back-Office sebagai ${outcome.user.username}`);
      return { ok: true };
    },
    logout: () => {
      commit({ user: undefined });
    },
    saveProduct: (draft, editingId) => {
      if (!isAllowed(role(), 'BO-03', 'Simpan Barang')) {
        return fail('MSG-003');
      }
      const all = store.getState().data.products;
      const existing = editingId === undefined ? undefined : lookup(editingId);
      const issue = validateProduct(draft, all, editingId, existing);
      if (issue !== undefined) {
        return { ok: false, issue };
      }
      // Hanya Owner boleh mengubah harga beli akhir dan HPP rata-rata.
      const product = buildProduct(
        draft,
        existing,
        existing?.id ?? nextProductId(all.length),
        role() === 'owner',
      );
      store.saveProduct(product);
      log('koreksi', `Barang ${product.code} ${existing === undefined ? 'ditambah' : 'diubah'}`);
      return { ok: true, product };
    },
    deactivateProduct: (id) => {
      if (!isAllowed(role(), 'BO-03', 'Nonaktifkan Barang')) {
        return fail('MSG-003');
      }
      const product = lookup(id);
      if (product === undefined) {
        return fail('MSG-003');
      }
      store.saveProduct({ ...product, active: false });
      log('koreksi', `Barang ${product.code} dinonaktifkan`);
      return { ok: true };
    },
    savePricing: (productId, rows, confirmed) => {
      if (!isAllowed(role(), 'BO-04', 'Simpan Harga')) {
        return { ok: false, kind: 'denied', messageId: 'MSG-003' };
      }
      const product = lookup(productId);
      if (product === undefined) {
        return { ok: false, kind: 'denied', messageId: 'MSG-003' };
      }
      const issue = validatePricing(rows);
      if (issue !== undefined) {
        return { ok: false, kind: 'issue', issue };
      }
      const flagged = belowHpp(rows, product.hpp);
      if (flagged.length > 0 && !confirmed) {
        return { ok: false, kind: 'confirm', rows: flagged };
      }
      const notes = describeChanges(product, rows);
      const next = buildUnits(rows);
      store.saveProduct({ ...product, units: next.units, prices: next.prices });
      log(
        'harga',
        `${product.code}: ${notes.length === 0 ? 'tanpa perubahan harga' : notes.join('; ')}`,
      );
      return { ok: true };
    },
    markReviewed: (productId) => {
      if (!isAllowed(role(), 'BO-05', 'Tandai Sudah Ditinjau (pada baris negatif)')) {
        return fail('MSG-003');
      }
      if (!store.getState().online) {
        return fail('MSG-001');
      }
      const product = lookup(productId);
      if (product === undefined) {
        return fail('MSG-003');
      }
      if (product.stock.display + product.stock.besar < 0) {
        return fail('MSG-070');
      }
      store.markReviewed(productId);
      log('koreksi', `Stok ${product.code} ditandai sudah ditinjau`);
      return { ok: true };
    },
    saveTransfer: (from, to, lines, note = '') => {
      if (!isAllowed(role(), 'BO-06', 'Simpan Mutasi')) {
        return fail('MSG-003');
      }
      const issue = validateTransfer(from, to, lines, lookup);
      if (issue !== undefined) {
        return fail(issue.messageId, issue.values, { line: issue.line });
      }
      const docs: TransferLineDoc[] = [];
      for (const line of lines) {
        const product = lookup(line.productId);
        const quantity = parseQuantity(line.quantity);
        if (product === undefined || quantity === undefined) {
          continue;
        }
        const base = toBase(product, line.unit, quantity);
        store.setStock(product.id, {
          ...product.stock,
          [from]: round3(product.stock[from] - base),
          [to]: round3(product.stock[to] + base),
        });
        docs.push({
          productId: product.id,
          code: product.code,
          name: product.name,
          unit: line.unit,
          quantity,
          baseQuantity: base,
        });
      }
      const number = store.takeNumber('M');
      commit({
        transfers: [
          ...state.transfers,
          { number, at: stamp(), userId: userId(), from, to, note: note.trim(), lines: docs },
        ],
      });
      log('mutasi', `${number}: ${String(docs.length)} barang dari ${from} ke ${to}`);
      return { ok: true, number };
    },
    newOpnameDraft: () => {
      commit({ opnameDraft: draftFor(state.opnameOrders) });
    },
    editOpname: (pso, patch) => {
      changeOpname(pso, (order) => {
        // Gudang hanya berubah selama perintah belum dihitung, karena barang dan stok sistem
        // mengikuti gudang itu.
        const warehouse =
          patch.warehouse !== undefined && order.hso === undefined
            ? patch.warehouse
            : order.warehouse;
        return {
          ...order,
          warehouse,
          date: patch.date ?? order.date,
          resultDate: patch.resultDate ?? order.resultDate,
          officerId: patch.officerId ?? order.officerId,
          note: patch.note ?? order.note,
        };
      });
    },
    addOpnameProducts: (pso, products) => {
      let added = 0;
      changeOpname(pso, (order) => {
        if (order.hso !== undefined) {
          return order;
        }
        const known = new Set(order.lines.map((line) => line.productId));
        const fresh: OpnameLine[] = [];
        for (const product of products) {
          if (!known.has(product.id)) {
            known.add(product.id);
            fresh.push({ productId: product.id, physical: '', systemSnapshot: undefined });
          }
        }
        added = fresh.length;
        return { ...order, lines: [...order.lines, ...fresh] };
      });
      return added;
    },
    removeOpnameLine: (pso, productId) => {
      changeOpname(pso, (order) =>
        order.hso === undefined
          ? { ...order, lines: order.lines.filter((line) => line.productId !== productId) }
          : order,
      );
    },
    saveOpnameOrder: (pso) => {
      if (!isAllowed(role(), 'BO-07', 'Simpan Draf Opname')) {
        return fail('MSG-003');
      }
      const order = orderOf(pso);
      if (order === undefined) {
        return fail('MSG-003');
      }
      if (order.status === 'selesai') {
        return fail('MSG-077');
      }
      if (order.lines.length === 0) {
        return { ok: false, empty: true };
      }
      if (pso === undefined) {
        commit({
          opnameOrders: [...state.opnameOrders, order],
          opnameDraft: draftFor([...state.opnameOrders, order]),
        });
      }
      log('opname', `${order.pso}: perintah disimpan (${String(order.lines.length)} barang)`);
      return { ok: true, pso: order.pso, status: order.status };
    },
    startOpnameCount: (pso) => {
      if (!isAllowed(role(), 'BO-07', 'Simpan Draf Opname')) {
        return fail('MSG-003');
      }
      const order = orderOf(pso);
      if (order === undefined || order.status === 'selesai') {
        return fail('MSG-077');
      }
      if (order.hso === undefined) {
        const hso = formatOrderNumber('HSO', nextSequence(state.opnameOrders, 'HSO'));
        changeOpname(pso, (current) => ({
          ...current,
          hso,
          resultDate: current.resultDate ?? today(),
          status: 'perhitungan',
        }));
        log('opname', `${order.pso}: penghitungan dimulai (${hso})`);
      }
      return { ok: true, pso: order.pso, status: 'perhitungan' };
    },
    setPhysical: (pso, productId, value) => {
      changeOpname(pso, (order) => ({
        ...order,
        lines: order.lines.map((line) =>
          line.productId === productId ? { ...line, physical: value } : line,
        ),
      }));
    },
    saveOpnameResult: (pso) => {
      if (!isAllowed(role(), 'BO-07', 'Simpan Draf Opname')) {
        return fail('MSG-003');
      }
      const order = orderOf(pso);
      if (order === undefined) {
        return fail('MSG-003');
      }
      const complete = isComplete(order);
      const issue = validateResult(order, false);
      if (issue !== undefined) {
        return fail(issue.messageId, {}, { productId: issue.productId });
      }
      if (filledCount(order) === 0) {
        return fail('MSG-074', {}, { productId: order.lines[0]?.productId });
      }
      const hso = order.hso ?? formatOrderNumber('HSO', nextSequence(state.opnameOrders, 'HSO'));
      if (!complete) {
        changeOpname(pso, (current) => ({
          ...current,
          hso,
          resultDate: current.resultDate ?? today(),
          status: 'perhitungan',
        }));
        log('opname', `${order.pso}: hasil sebagian disimpan (${hso})`);
        return { ok: true, pso: order.pso, status: 'perhitungan' };
      }
      if (!isAllowed(role(), 'BO-07', 'Terapkan Penyesuaian Stok')) {
        return fail('MSG-003');
      }
      const changes = order.lines.flatMap((line) => {
        const product = lookup(line.productId);
        const physical = parsePhysical(line.physical);
        if (product === undefined || physical === undefined) {
          return [];
        }
        const system = systemStock(product, order.warehouse, line);
        return [{ line, product, physical, system, diff: difference(system, physical) }];
      });
      const changed = changes.filter((item) => item.diff !== 0);
      for (const item of changed) {
        store.setStock(item.product.id, {
          ...item.product.stock,
          [order.warehouse]: item.physical,
        });
      }
      const journalValue = Math.round(
        changed.reduce((sum, item) => sum + item.diff * item.product.hpp, 0),
      );
      changeOpname(pso, (current) => ({
        ...current,
        hso,
        resultDate: current.resultDate ?? today(),
        status: 'selesai',
        appliedBy: userId(),
        journalValue,
        lines: changes.map((item) => ({ ...item.line, systemSnapshot: item.system })),
      }));
      log(
        'opname',
        `${order.pso}: ${String(changed.length)} barang disesuaikan, jurnal selisih ${String(journalValue)}`,
      );
      return { ok: true, pso: order.pso, status: 'selesai' };
    },
    printInvoiceCopy: (number) => {
      if (!isAllowed(role(), 'BO-09', 'Cetak Ulang Invoice')) {
        return fail('MSG-003');
      }
      log('cetak', `Salinan invoice ${number} dicetak ulang`);
      return { ok: true };
    },
  };
}
