import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { INSTAGRAM_URL } from '../data';

/**
 * Storefront support channels. Reads the owner's saved store_settings row
 * (publicly readable via RLS) so customer-facing copy always matches what the
 * owner configured in the admin console. Falls back to Instagram when no
 * contact details are saved yet.
 */

const DEFAULTS = {
  support_phone: '',
  support_whatsapp: '',
  support_email: '',
};

export function useSupport() {
  const [support, setSupport] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const fallback = { ...DEFAULTS, instagram: INSTAGRAM_URL, loaded: false };
      if (!supabase) { if (active) setSupport(fallback); return; }
      try {
        const { data } = await supabase
          .from('store_settings')
          .select('settings')
          .eq('id', 'default')
          .maybeSingle();
        const s = data?.settings || {};
        if (active) setSupport({
          support_phone: s.support_phone || s.whatsapp || '',
          support_whatsapp: s.support_whatsapp || s.whatsapp || '',
          support_email: s.support_email || '',
          instagram: INSTAGRAM_URL,
          loaded: true,
        });
      } catch {
        if (active) setSupport(fallback);
      }
    })();
    return () => { active = false; };
  }, []);

  return support;
}

/** Build a wa.me link from a saved WhatsApp number, if one exists. */
export function whatsappUrl(number) {
  const digits = String(number || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  return `https://wa.me/${digits}`;
}
