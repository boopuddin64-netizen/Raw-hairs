import { useCallback, useEffect, useState } from 'react';
import { supabase, supabaseConfigured } from '../lib/supabase';

const STORAGE_KEY = 'raw-hairs-store-config';

const DEFAULTS = {
  settings: {
    store_name: 'RAW HAIRS',
    currency: 'NGN',
    tax_rate: 0,
    delivery_fee_default: 2500,
    min_order_free_delivery: 50000,
    support_phone: '',
    support_whatsapp: '',
    support_email: '',
  },
  rules: {
    auto_confirm_bookings: false,
    require_payment_before_dispatch: true,
    allow_guest_checkout: true,
    max_items_per_order: 20,
    rider_assignment_mode: 'manual',
  },
  goals: {
    daily_revenue: 150000,
    weekly_revenue: 1000000,
    monthly_orders: 80,
  },
};

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const parsed = JSON.parse(raw);
    return {
      settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) },
      rules: { ...DEFAULTS.rules, ...(parsed.rules || {}) },
      goals: { ...DEFAULTS.goals, ...(parsed.goals || {}) },
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
    if (!supabaseConfigured) return;
    (async () => {
      const { data, error } = await supabase
        .from('store_settings')
        .select('settings, rules, goals')
        .eq('id', 'default')
        .maybeSingle();
      if (error || !data) return;
      setConfig({
        settings: { ...DEFAULTS.settings, ...(data.settings || {}) },
        rules: { ...DEFAULTS.rules, ...(data.rules || {}) },
        goals: { ...DEFAULTS.goals, ...(data.goals || {}) },
      });
    })();
  }, []);

  const save = useCallback(async (next) => {
    setSaving(true);
    setMessage('');
    const payload = next || config;
    try {
      if (supabaseConfigured) {
        const { error } = await supabase.from('store_settings').upsert({
          id: 'default',
          settings: payload.settings,
          rules: payload.rules,
          goals: payload.goals,
          updated_at: new Date().toISOString(),
        });
        if (error) throw error;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      setConfig(payload);
      setMessage(supabaseConfigured ? 'Saved to the store database' : 'Saved on this device only');
    } catch (e) {
      setMessage(e?.message || 'Could not save store settings. Please try again.');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 3500);
    }
  }, [config]);

  return { config, setConfig, save, saving, message, defaults: DEFAULTS };
}
