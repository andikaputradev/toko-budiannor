import type { BoSession } from './bo-session';
import { ledgerFor } from './domain/stock-correction';
import { extraMovements, type MovementSources } from './domain/stock-report';

// Sumber gerak stok untuk Kartu Stok dan tab Mutasi pada Info barang.
export function movementSourcesFor(session: BoSession): MovementSources {
  const state = session.store.getState();
  return {
    sales: state.data.sales,
    customers: state.data.customers,
    suppliers: state.data.suppliers,
    purchaseOrders: state.purchaseOrders,
    transfers: session.state().transfers,
    opname: session.state().opname,
    corrections: ledgerFor(session.store).docs(),
    extra: extraMovements(),
  };
}
