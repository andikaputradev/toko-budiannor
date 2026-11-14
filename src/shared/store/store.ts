import { generateDataset, REFERENCE_DATE } from '../data/generator';
import { withProposalData } from '../data/proposal';
import { checkReceivable, type ReceivableDecision } from '../data/receivable';
import {
  ROLES,
  type ActivityEvent,
  type Customer,
  type Dataset,
  type Product,
  type Role,
  type Stock,
  type ApprovalRequest,
  type DepositEntry,
  type PurchaseOrder,
  type ReturnNote,
  type SalesOrder,
  type Supplier,
} from '../data/types';
import { formatDocumentNumber, type DocumentKind } from '../format';
import { round3 } from '../data/units';
import { createEventBus, type EventBus } from './event-bus';
import { createPersistence, type Persistence, type PersistenceOptions } from './persistence';

export const SESSION_KEY = 'toko-budiannor-simulasi';
export const LIMIT_SCENARIO_AMOUNT = 1200000;

export interface Scenario {
  readonly limitCustomerId: string | undefined;
  readonly limitAmount: number;
  readonly negativeProductId: string | undefined;
}

export interface Session {
  readonly version: 1;
  readonly role: Role;
  readonly online: boolean;
  readonly reviewMode: boolean;
  readonly printerConnected: boolean;
  readonly scenario: Scenario;
  readonly negativeReview: readonly string[];
  readonly stockOverrides: Readonly<Record<string, Stock>>;
}

export interface AppState extends Omit<Session, 'version' | 'stockOverrides'> {
  readonly userId: string;
  readonly data: Dataset;
  readonly activity: readonly ActivityEvent[];
  readonly posQueue: number;
  readonly approvals: readonly ApprovalRequest[];
  readonly salesOrders: readonly SalesOrder[];
  readonly purchaseOrders: readonly PurchaseOrder[];
  readonly returnNotes: readonly ReturnNote[];
  readonly depositEntries: readonly DepositEntry[];
  readonly counters: Readonly<Record<string, number>>;
}

export type ScenarioEvent =
  | { readonly kind: 'limit'; readonly customerId: string; readonly decision: ReceivableDecision }
  | { readonly kind: 'negative'; readonly productId: string };

export interface StoreEvents {
  state: AppState;
  role: { readonly role: Role; readonly userId: string };
  connectivity: { readonly online: boolean };
  review: { readonly reviewMode: boolean };
  scenario: ScenarioEvent;
  reset: { readonly seed: number };
}

export interface Store {
  readonly bus: EventBus<StoreEvents>;
  getState(): AppState;
  subscribe(listener: (state: AppState) => void): () => void;
  setRole(role: Role): void;
  setUser(userId: string): void;
  setOnline(online: boolean): void;
  setReviewMode(reviewMode: boolean): void;
  setPrinter(connected: boolean): void;
  applyStockChange(changes: Readonly<Record<string, number>>): string[];
  addCustomer(customer: Customer): void;
  logActivity(event: Omit<ActivityEvent, 'id'>): ActivityEvent;
  saveProduct(product: Product): void;
  setStock(productId: string, stock: Stock): boolean;
  markReviewed(productId: string): void;
  reportQueue(count: number): void;
  saveCustomer(customer: Customer): void;
  saveSupplier(supplier: Supplier): void;
  resolveApproval(
    id: string,
    status: 'disetujui' | 'ditolak',
    by: string,
    at: string,
    note: string,
  ): void;
  addSalesOrder(order: SalesOrder): void;
  addApproval(request: ApprovalRequest): void;
  markSalesOrderSynced(number: string): void;
  addPurchaseOrder(order: PurchaseOrder): void;
  saveReturnNote(note: ReturnNote): void;
  addDepositEntry(entry: DepositEntry): void;
  peekNumber(kind: DocumentKind): string;
  takeNumber(kind: DocumentKind): string;
  triggerLimitRejected(): ScenarioEvent | undefined;
  triggerNegativeStock(): ScenarioEvent | undefined;
  resetData(): void;
  close(): void;
}

export interface StoreOptions {
  readonly persistence?: Persistence<Session> | undefined;
  readonly dataset?: Dataset | undefined;
  readonly reviewMode?: boolean | undefined;
}

const INITIAL_COUNTERS: Readonly<Record<string, number>> = { M: 1 };

const EMPTY_SCENARIO: Scenario = {
  limitCustomerId: undefined,
  limitAmount: LIMIT_SCENARIO_AMOUNT,
  negativeProductId: undefined,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStock(value: unknown): value is Stock {
  return (
    isRecord(value) && typeof value['display'] === 'number' && typeof value['besar'] === 'number'
  );
}

export function parseSession(raw: unknown): Session | undefined {
  if (!isRecord(raw) || raw['version'] !== 1) {
    return undefined;
  }
  const role = ROLES.find((item) => item === raw['role']);
  const scenario = raw['scenario'];
  const overrides = raw['stockOverrides'];
  const review = raw['negativeReview'];
  if (
    role === undefined ||
    typeof raw['online'] !== 'boolean' ||
    typeof raw['reviewMode'] !== 'boolean' ||
    !isRecord(scenario) ||
    !isRecord(overrides) ||
    !Array.isArray(review)
  ) {
    return undefined;
  }
  const limitCustomerId = scenario['limitCustomerId'];
  const negativeProductId = scenario['negativeProductId'];
  const stockOverrides: Record<string, Stock> = {};
  for (const [id, stock] of Object.entries(overrides)) {
    if (isStock(stock)) {
      stockOverrides[id] = { display: stock.display, besar: stock.besar };
    }
  }
  return {
    version: 1,
    role,
    online: raw['online'],
    reviewMode: raw['reviewMode'],
    printerConnected: typeof raw['printerConnected'] === 'boolean' ? raw['printerConnected'] : true,
    scenario: {
      limitCustomerId: typeof limitCustomerId === 'string' ? limitCustomerId : undefined,
      limitAmount: LIMIT_SCENARIO_AMOUNT,
      negativeProductId: typeof negativeProductId === 'string' ? negativeProductId : undefined,
    },
    negativeReview: review.filter((item): item is string => typeof item === 'string'),
    stockOverrides,
  };
}

export function createSessionPersistence(
  overrides: Partial<Pick<PersistenceOptions<Session>, 'storage' | 'createChannel'>> = {},
): Persistence<Session> {
  return createPersistence<Session>({ key: SESSION_KEY, parse: parseSession, ...overrides });
}

function userIdFor(data: Dataset, role: Role): string {
  return data.users.find((user) => user.role === role && user.active)?.id ?? '';
}

function shiftStock(stock: Stock, delta: number): Stock {
  if (delta >= 0) {
    return { display: round3(stock.display + delta), besar: stock.besar };
  }
  let rest = -delta;
  const fromDisplay = Math.min(Math.max(stock.display, 0), rest);
  rest = round3(rest - fromDisplay);
  const fromBesar = Math.min(Math.max(stock.besar, 0), rest);
  rest = round3(rest - fromBesar);
  return {
    display: round3(stock.display - fromDisplay - rest),
    besar: round3(stock.besar - fromBesar),
  };
}

function toSession(state: AppState, overrides: Readonly<Record<string, Stock>>): Session {
  return {
    version: 1,
    role: state.role,
    online: state.online,
    reviewMode: state.reviewMode,
    printerConnected: state.printerConnected,
    scenario: state.scenario,
    negativeReview: state.negativeReview,
    stockOverrides: overrides,
  };
}

export function createStore(options: StoreOptions = {}): Store {
  const baseData = options.dataset ?? withProposalData(generateDataset());
  const persistence = options.persistence;
  const bus = createEventBus<StoreEvents>();
  const saved = persistence?.load();
  let overrides: Readonly<Record<string, Stock>> = saved?.stockOverrides ?? {};
  let added: readonly Customer[] = [];
  let edits: ReadonlyMap<string, Product> = new Map();
  let created: readonly Product[] = [];
  let customerEdits: ReadonlyMap<string, Customer> = new Map();
  let supplierEdits: ReadonlyMap<string, Supplier> = new Map();
  let addedSuppliers: readonly Supplier[] = [];
  const compose = (): Dataset => {
    const touched = Object.keys(overrides).length > 0 || edits.size > 0 || created.length > 0;
    const place = (product: Product): Product => {
      const edited = edits.get(product.id) ?? product;
      const stock = overrides[product.id];
      return stock === undefined ? edited : { ...edited, stock };
    };
    return {
      ...baseData,
      products: touched
        ? [...baseData.products.map(place), ...created.map(place)]
        : baseData.products,
      customers:
        added.length === 0 && customerEdits.size === 0
          ? baseData.customers
          : [...baseData.customers, ...added].map((item) => customerEdits.get(item.id) ?? item),
      suppliers:
        supplierEdits.size === 0 && addedSuppliers.length === 0
          ? baseData.suppliers
          : [...baseData.suppliers, ...addedSuppliers].map(
              (item) => supplierEdits.get(item.id) ?? item,
            ),
    };
  };
  const pendingSeed = baseData.queue.filter((item) => item.status === 'menunggu').length;
  const role = saved?.role ?? 'owner';
  let state: AppState = {
    role,
    userId: userIdFor(baseData, role),
    online: saved?.online ?? true,
    reviewMode: options.reviewMode ?? saved?.reviewMode ?? false,
    printerConnected: saved?.printerConnected ?? true,
    scenario: saved?.scenario ?? EMPTY_SCENARIO,
    negativeReview: saved?.negativeReview ?? [],
    data: compose(),
    activity: [],
    posQueue: pendingSeed,
    approvals: baseData.approvals,
    salesOrders: [],
    purchaseOrders: [],
    returnNotes: [],
    depositEntries: [],
    counters: INITIAL_COUNTERS,
  };

  const publish = (broadcast: boolean): void => {
    if (broadcast) {
      persistence?.save(toSession(state, overrides));
    }
    bus.emit('state', state);
  };

  const unsubscribe = persistence?.subscribe((incoming) => {
    overrides = incoming.stockOverrides;
    state = {
      ...state,
      role: incoming.role,
      userId: userIdFor(baseData, incoming.role),
      online: incoming.online,
      reviewMode: incoming.reviewMode,
      printerConnected: incoming.printerConnected,
      scenario: incoming.scenario,
      negativeReview: incoming.negativeReview,
      data: compose(),
    };
    publish(false);
  });

  const customerNow = (): Date => new Date(state.data.referenceDate);

  return {
    bus,
    getState: () => state,
    subscribe: (listener) => bus.on('state', listener),
    setRole: (next) => {
      state = { ...state, role: next, userId: userIdFor(state.data, next) };
      bus.emit('role', { role: next, userId: state.userId });
      publish(true);
    },
    setUser: (userId) => {
      const user = state.data.users.find((item) => item.id === userId && item.active);
      if (user === undefined) {
        return;
      }
      state = { ...state, role: user.role, userId: user.id };
      bus.emit('role', { role: user.role, userId: user.id });
      publish(true);
    },
    setOnline: (online) => {
      state = { ...state, online };
      bus.emit('connectivity', { online });
      publish(true);
    },
    setReviewMode: (reviewMode) => {
      state = { ...state, reviewMode };
      bus.emit('review', { reviewMode });
      publish(true);
    },
    setPrinter: (printerConnected) => {
      state = { ...state, printerConnected };
      publish(true);
    },
    applyStockChange: (changes) => {
      const flagged: string[] = [];
      const nextOverrides: Record<string, Stock> = { ...overrides };
      let review = state.negativeReview;
      for (const [id, delta] of Object.entries(changes)) {
        const product = state.data.products.find((item) => item.id === id);
        if (product === undefined) {
          continue;
        }
        const stock = shiftStock(product.stock, delta);
        nextOverrides[id] = stock;
        if (stock.display + stock.besar < 0 && !review.includes(id)) {
          review = [...review, id];
          flagged.push(id);
        }
      }
      overrides = nextOverrides;
      state = { ...state, negativeReview: review, data: compose() };
      publish(true);
      return flagged;
    },
    addCustomer: (customer) => {
      added = [...added, customer];
      state = { ...state, data: compose() };
      publish(false);
    },
    logActivity: (event) => {
      const created: ActivityEvent = { ...event, id: `A-${String(state.activity.length + 1)}` };
      state = { ...state, activity: [...state.activity, created] };
      publish(false);
      return created;
    },
    saveProduct: (product) => {
      if (baseData.products.some((item) => item.id === product.id)) {
        edits = new Map(edits).set(product.id, product);
      } else if (created.some((item) => item.id === product.id)) {
        created = created.map((item) => (item.id === product.id ? product : item));
      } else {
        created = [...created, product];
      }
      state = { ...state, data: compose() };
      publish(false);
    },
    setStock: (productId, stock) => {
      overrides = {
        ...overrides,
        [productId]: { display: round3(stock.display), besar: round3(stock.besar) },
      };
      const negative = stock.display + stock.besar < 0;
      const review =
        negative && !state.negativeReview.includes(productId)
          ? [...state.negativeReview, productId]
          : state.negativeReview;
      state = { ...state, negativeReview: review, data: compose() };
      publish(true);
      return negative;
    },
    markReviewed: (productId) => {
      state = {
        ...state,
        negativeReview: state.negativeReview.filter((item) => item !== productId),
      };
      publish(true);
    },
    reportQueue: (count) => {
      if (count === state.posQueue) {
        return;
      }
      state = { ...state, posQueue: count };
      publish(false);
    },
    saveCustomer: (customer) => {
      customerEdits = new Map(customerEdits).set(customer.id, customer);
      state = { ...state, data: compose() };
      publish(false);
    },
    saveSupplier: (supplier) => {
      if (
        !baseData.suppliers.some((item) => item.id === supplier.id) &&
        !addedSuppliers.some((item) => item.id === supplier.id)
      ) {
        addedSuppliers = [...addedSuppliers, supplier];
      }
      supplierEdits = new Map(supplierEdits).set(supplier.id, supplier);
      state = { ...state, data: compose() };
      publish(false);
    },
    resolveApproval: (id, status, by, at, note) => {
      state = {
        ...state,
        approvals: state.approvals.map((item) =>
          item.id === id && item.status === 'menunggu'
            ? { ...item, status, decidedBy: by, decidedAt: at, note }
            : item,
        ),
      };
      publish(false);
    },
    markSalesOrderSynced: (number) => {
      state = {
        ...state,
        salesOrders: state.salesOrders.map((item) =>
          item.number === number ? { ...item, synced: true } : item,
        ),
      };
      publish(false);
    },
    addApproval: (request) => {
      state = { ...state, approvals: [...state.approvals, request] };
      publish(false);
    },
    addSalesOrder: (order) => {
      state = { ...state, salesOrders: [...state.salesOrders, order] };
      publish(false);
    },
    addPurchaseOrder: (order) => {
      state = { ...state, purchaseOrders: [...state.purchaseOrders, order] };
      publish(false);
    },
    saveReturnNote: (note) => {
      const known = state.returnNotes.some((item) => item.id === note.id);
      state = {
        ...state,
        returnNotes: known
          ? state.returnNotes.map((item) => (item.id === note.id ? note : item))
          : [...state.returnNotes, note],
      };
      publish(false);
    },
    addDepositEntry: (entry) => {
      state = { ...state, depositEntries: [...state.depositEntries, entry] };
      publish(false);
    },
    peekNumber: (kind) => formatDocumentNumber(kind, (state.counters[kind] ?? 0) + 1),
    takeNumber: (kind) => {
      const next = (state.counters[kind] ?? 0) + 1;
      state = { ...state, counters: { ...state.counters, [kind]: next } };
      return formatDocumentNumber(kind, next);
    },
    triggerLimitRejected: () => {
      const customer = state.data.customers.find(
        (item) => !checkReceivable(item, LIMIT_SCENARIO_AMOUNT, customerNow()).ok,
      );
      if (customer === undefined) {
        return undefined;
      }
      const event: ScenarioEvent = {
        kind: 'limit',
        customerId: customer.id,
        decision: checkReceivable(customer, LIMIT_SCENARIO_AMOUNT, customerNow()),
      };
      state = { ...state, scenario: { ...state.scenario, limitCustomerId: customer.id } };
      bus.emit('scenario', event);
      publish(true);
      return event;
    },
    triggerNegativeStock: () => {
      const product = state.data.products.find(
        (item) =>
          !state.negativeReview.includes(item.id) && item.stock.display + item.stock.besar > 0,
      );
      if (product === undefined) {
        return undefined;
      }
      const stock: Stock = { display: -Math.max(1, Math.round(product.minStock / 4)), besar: 0 };
      overrides = { ...overrides, [product.id]: stock };
      state = {
        ...state,
        scenario: { ...state.scenario, negativeProductId: product.id },
        negativeReview: [...state.negativeReview, product.id],
        data: compose(),
      };
      const event: ScenarioEvent = { kind: 'negative', productId: product.id };
      bus.emit('scenario', event);
      publish(true);
      return event;
    },
    resetData: () => {
      overrides = {};
      added = [];
      edits = new Map();
      created = [];
      customerEdits = new Map();
      supplierEdits = new Map();
      addedSuppliers = [];
      state = {
        role: 'owner',
        userId: userIdFor(baseData, 'owner'),
        online: true,
        reviewMode: state.reviewMode,
        printerConnected: true,
        scenario: EMPTY_SCENARIO,
        negativeReview: [],
        data: baseData,
        activity: [],
        posQueue: pendingSeed,
        approvals: baseData.approvals,
        salesOrders: [],
        purchaseOrders: [],
        returnNotes: [],
        depositEntries: [],
        counters: INITIAL_COUNTERS,
      };
      bus.emit('reset', { seed: baseData.seed });
      publish(true);
    },
    close: () => {
      unsubscribe?.();
      persistence?.close();
      bus.clear();
    },
  };
}

export const REFERENCE_NOW = new Date(REFERENCE_DATE);
