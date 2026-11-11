import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const TABLES = [
  ['products', 'products'],
  ['services', 'services'],
  ['orders', 'orders'],
  ['bookings', 'bookings'],
  ['requests', 'international_requests'],
  ['jobs', 'rider_jobs'],
];

export function useRealtimeDashboard() {
  const [data, setData] = useState({
    products: [], services: [], orders: [], bookings: [], requests: [], jobs: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const silent = useRef(false);

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (!supabase) {
      setError('Supabase is not configured.');
      setLoading(false);
      return;
    }
    if (!quiet) setLoading(true);
    silent.current = quiet;
    setError('');

    const results = await Promise.all(TABLES.map(async ([key, table]) => {
      const { data: rows, error: queryError } = await supabase
        .from(table)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);
      return { key, rows, error: queryError };
    }));

    const failed = results.find((r) => r.error);
    if (failed) {
      setError(`${failed.error.message} (loading ${failed.key})`);
      setLoading(false);
      return;
    }

    setData(Object.fromEntries(results.map((r) => [r.key, r.rows || []])));
    setUpdatedAt(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!supabase) return undefined;
    const channel = supabase
      .channel('raw-hairs-admin-analytics')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        setLastEvent({ table: 'orders', event: payload.eventType, at: new Date() });
        refresh({ quiet: true });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, (payload) => {
        setLastEvent({ table: 'bookings', event: payload.eventType, at: new Date() });
        refresh({ quiet: true });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'international_requests' }, (payload) => {
        setLastEvent({ table: 'international_requests', event: payload.eventType, at: new Date() });
        refresh({ quiet: true });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
        setLastEvent({ table: 'products', event: payload.eventType, at: new Date() });
        refresh({ quiet: true });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_jobs' }, (payload) => {
        setLastEvent({ table: 'rider_jobs', event: payload.eventType, at: new Date() });
        refresh({ quiet: true });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, (payload) => {
        setLastEvent({ table: 'services', event: payload.eventType, at: new Date() });
        refresh({ quiet: true });
      })
      .subscribe((status) => { setLive(status === 'SUBSCRIBED'); });

    return () => {
      supabase.removeChannel(channel);
      setLive(false);
    };
  }, [refresh]);

  // Flatten for Admin consumption
  return {
    products: data.products,
    services: data.services,
    orders: data.orders,
    bookings: data.bookings,
    international: data.requests,
    riderJobs: data.jobs,
    data,
    loading,
    error,
    setError,
    refresh,
    live,
    lastEvent,
    updatedAt,
  };
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgo(n) {
  const d = startOfDay(new Date());
  d.setDate(d.getDate() - n);
  return d;
}

function safeJson(str) {
  try { return JSON.parse(str); } catch { return null; }
}

export function buildAnalytics({ orders = [], bookings = [], products = [], services = [], international = [], riderJobs = [] } = {}) {
  const paidStatuses = new Set(['paid', 'processing', 'dispatched', 'delivered']);
  const isPaid = (o) => paidStatuses.has(o.status);
  const totalOf = (list) => list.reduce((sum, o) => sum + (Number(o.total || o.amount) || 0), 0);

  const today = startOfDay(new Date());
  const week = daysAgo(6);

  const ordersToday = orders.filter((o) => o.created_at && new Date(o.created_at) >= today);
  const ordersWeek = orders.filter((o) => o.created_at && new Date(o.created_at) >= week);
  const paidAll = orders.filter(isPaid);
  const paidToday = ordersToday.filter(isPaid);
  const paidWeek = ordersWeek.filter(isPaid);

  const revenueToday = totalOf(paidToday);
  const revenueWeek = totalOf(paidWeek);
  const revenueAll = totalOf(paidAll);

  const revenueSeries = [];
  for (let i = 6; i >= 0; i -= 1) {
    const day = daysAgo(i);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const dayOrders = orders.filter((o) => {
      if (!o.created_at) return false;
      const t = new Date(o.created_at);
      return t >= day && t < next;
    });
    const dayPaid = dayOrders.filter(isPaid);
    revenueSeries.push({
      key: day.toISOString().slice(0, 10),
      label: day.toLocaleDateString('en-NG', { weekday: 'short' }),
      value: totalOf(dayPaid),
      orders: dayOrders.length,
    });
  }

  const productSales = {};
  products.forEach((p) => {
    productSales[p.id] = {
      id: p.id,
      name: p.name,
      category: p.category || 'Uncategorised',
      price: Number(p.price) || 0,
      stock: Number(p.stock) || 0,
      count: 0,
      revenue: 0,
    };
  });
  orders.forEach((o) => {
    const items = Array.isArray(o.items) ? o.items : (typeof o.items === 'string' ? safeJson(o.items) : null);
    if (!items) return;
    items.forEach((it) => {
      const id = it.product_id || it.id;
      if (!id || !productSales[id]) return;
      const qty = Number(it.qty || it.quantity || 1);
      const line = Number(it.price || productSales[id].price) * qty;
      productSales[id].count += qty;
      productSales[id].revenue += line;
    });
  });
  const topProducts = Object.values(productSales)
    .sort((a, b) => (b.revenue || b.count) - (a.revenue || a.count))
    .slice(0, 8);

  const byCategory = {};
  topProducts.forEach((p) => {
    const cat = p.category || 'Uncategorised';
    byCategory[cat] = (byCategory[cat] || 0) + (p.revenue || 0);
  });
  if (Object.keys(byCategory).length === 0) {
    products.forEach((p) => {
      const cat = p.category || 'Uncategorised';
      byCategory[cat] = (byCategory[cat] || 0) + (Number(p.price) || 0);
    });
  }

  const byDriver = {};
  riderJobs.forEach((j) => {
    const key = j.rider_id || j.rider_name || 'Unassigned';
    if (!byDriver[key]) byDriver[key] = { id: key, jobs: 0, delivered: 0 };
    byDriver[key].jobs += 1;
    if (j.status === 'delivered') byDriver[key].delivered += 1;
  });

  const funnel = {
    catalogue: products.filter((p) => p.is_active !== false && p.active !== false).length,
    orders: orders.length,
    paid: paidAll.length,
    delivered: orders.filter((o) => o.status === 'delivered').length,
    bookings: bookings.length,
    confirmedBookings: bookings.filter((b) => ['confirmed', 'completed'].includes(b.status)).length,
  };

  return {
    revenueToday,
    revenueWeek,
    revenueAll,
    ordersAll: orders.length,
    ordersPaid: paidAll.length,
    bookingsAll: bookings.length,
    bookingsConfirmed: bookings.filter((b) => ['confirmed', 'completed'].includes(b.status)).length,
    productsActive: products.filter((p) => p.is_active !== false && p.active !== false).length,
    openJobs: riderJobs.filter((j) => !['delivered', 'failed'].includes(j.status)).length,
    revenueSeries,
    topProducts,
    byCategory,
    byDriver: Object.values(byDriver).sort((a, b) => b.delivered - a.delivered),
    funnel,
  };
}
