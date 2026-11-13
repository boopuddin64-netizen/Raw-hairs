import { Link } from 'react-router-dom';
import { useRealtimeDashboard } from '../hooks/useRealtimeDashboard';
import OrdersManager from './admin/OrdersManager';

/**
 * Full order console (admin) — /#/admin/orders
 * Reuses the realtime dashboard hook (15s quiet polling, focus refresh)
 * and the OrdersManager card list: payment state, items, contact info
 * and status control for every order, on one page.
 */
export default function Orders() {
  const { orders, payments, loading, error, refresh } = useRealtimeDashboard();

  return (
    <div className="dash">
      <header className="dash-top">
        <div>
          <p className="eyebrow">Admin console</p>
          <h1>Orders</h1>
          <p className="muted">Payment state, items and status for every order</p>
        </div>
        <div className="dash-actions">
          <Link className="btn btn-ghost" to="/admin">Admin portal</Link>
          <Link className="btn btn-ghost" to="/admin/dispatch">Dispatch</Link>
        </div>
      </header>

      {error && <div className="dash-alert">{error}</div>}
      {loading && <p className="muted">Loading orders…</p>}

      <OrdersManager orders={orders} payments={payments} refresh={refresh} />
    </div>
  );
}
