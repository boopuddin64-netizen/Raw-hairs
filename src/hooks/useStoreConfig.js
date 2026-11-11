import { useCallback, useEffect, useState } from 'react';
import { supabase, supabaseConfigured } from '../lib/supabase';

const KEY = 'raw-hairs-store-config';

const DEFAULTS = {
  settings: {
    store_name: 'RAW HAIRS',
    support_handle: '@raw.hairs',
    support_phone: '',
    support_email: '',
    currency: 'NGN',
    delivery_lagos_fee: 2500,
    delivery_outside_fee: 4500,
    free_delivery_min: 80000,
    tax_percent: 0,
    low_stock_threshold: 2,
    booking_lead_hours: 24,
    booking_open_hour: 9,
    booking_close_hour: 18,
    international_enabled: true,
    instagram_url: 'https://instagram.com/raw.hairs',
  },
  rules: {
    auto_confirm_bookings: false,
    require_account_for_checkout: false,
    allow_guest_bookings: true,
    max_cart_qty_per_item: 5,
    hide_sold_out: true,
    allow_negative_stock: false,
    order_auto_processing: true,
    driver_must_confirm_pickup: true,
  },
  goals: {
    daily_revenue: 150000,
    weekly_revenue: 900000,
    monthly_orders: 80,
    booking_fill_rate: 70,
  },
  ratings: {
    enabled: true,
    require_purchase: false,
    public_on_product: true,
  },
};

function loadLocal() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const parsed = JSON.parse(raw);
    return {
      settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) },
      rules: { ...DEFAULTS.rules, ...(parsed.rules || {}) },
      goals: { ...DEFAULTS.goals, ...(parsed.goals || {}) },
      ratings: { ...DEFAULTS.ratings, ...(parsed.ratings || {}) },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function useStoreConfig() {
  const [config, setConfig] = useState(loadLocal);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    if (!supabaseConfigured || !supabase) return undefined;
    let active = true;
    (async () => {
      const { data, error } = await supabase.from('store_settings').select('key, value').limit(50);
      if (!active || error || !data?.length) return;
      const next = loadLocal();
      data.forEach((row) => {
        if (row.key === 'settings' && row.value) next.settings = { ...next.settings, ...row.value };
        if (row.key === 'rules' && row.value) next.rules = { ...next.rules, ...row.value };
        if (row.key === 'goals' && row.value) next.goals = { ...next.goals, ...row.value };
        if (row.key === 'ratings' && row.value) next.ratings = { ...next.ratings, ...row.value };
      });
      setConfig(next);
    })();
    return () => { active = false; };
  }, []);

  const updateSection = useCallback((section, patch) => {
    setConfig((prev) => ({
      ...prev,
      [section]: { ...prev[section], ...patch },
    }));
  }, []);

  const saveToCloud = useCallback(async () => {
    if (!supabase) {
      setMessage('Saved on this device. Cloud settings table not connected.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const rows = ['settings', 'rules', 'goals', 'ratings'].map((key) => ({
        key,
        value: config[key],
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from('store_settings').upsert(rows, { onConflict: 'key' });
      if (error) throw error;
      setMessage('Saved to cloud.');
    } catch (err) {
      setMessage(err?.message || 'Cloud save failed — kept on this device.');
    } finally {
      setSaving(false);
    }
  }, [config]);

  return { config, updateSection, saveToCloud, saving, message, defaults: DEFAULTS };
}
