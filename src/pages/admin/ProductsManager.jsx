import { useEffect, useMemo, useState } from 'react';
import { supabase, supabaseConfigured } from '../../lib/supabase';
import { categories } from '../../data';
import { PRODUCT_BUCKET, isStoragePath, productImageUrl } from '../../lib/images';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const DEFAULT_LENGTHS = '12, 14, 16, 18, 20, 22, 24, 26';

const money = (v) => (v == null || Number.isNaN(Number(v)) ? '—' : '₦' + Number(v).toLocaleString('en-NG'));
const slugify = (v) => v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const parseList = (text) => String(text || '').split(',').map((s) => s.trim()).filter(Boolean);
const parseLengths = (text) => [...new Set(parseList(text).map(Number).filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);

const blank = () => ({
  id: null, name: '', slug: '', category: categories[0].name, price: '', stock: '',
  weight_grams: '', base_length: '16', length_options: DEFAULT_LENGTHS, lace_options: '',
  hair_type: 'Raw Vietnamese', description: '', is_active: true, image_path: '',
});

const toForm = (p) => ({
  id: p.id, name: p.name || '', slug: p.slug || '', category: p.category || categories[0].name,
  price: p.price ?? '', stock: p.stock ?? '', weight_grams: p.weight_grams ?? '',
  base_length: String(p.base_length ?? 16),
  length_options: (p.length_options?.length ? p.length_options : parseLengths(DEFAULT_LENGTHS)).join(', '),
  lace_options: (p.lace_options || []).join(', '),
  hair_type: p.hair_type || '', description: p.description || '', is_active: p.is_active !== false,
  image_path: p.image_path || '',
});

function friendlyError(err) {
  const msg = err?.message || 'Something went wrong. Please try again.';
  if (err?.code === '42501' || /row-level security|permission denied|not authorized/i.test(msg)) {
    return 'You are signed in, but this account is not authorised to change the catalogue in Supabase. Set app_metadata.role to "admin" for this user, then sign out and back in.';
  }
  if (err?.code === '23505') return 'A product with that slug already exists. Change the slug and try again.';
  if (/column .* does not exist/i.test(msg)) return 'The database is missing the latest catalogue columns. Apply the grok_catalogue_import migration first.';
  return msg;
}

export default function ProductsManager({ products, refresh }) {
  const [form, setForm] = useState(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (!file) { setPreview(''); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const categoryNames = useMemo(() => {
    const known = categories.map((c) => c.name);
    return form?.category && !known.includes(form.category) ? [...known, form.category] : known;
  }, [form?.category]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const open = (product) => { setMsg(null); setFile(null); setSlugTouched(Boolean(product)); setForm(product ? toForm(product) : blank()); };
  const close = () => { setForm(null); setFile(null); };

  function onName(value) {
    setForm((f) => ({ ...f, name: value, slug: slugTouched ? f.slug : slugify(value) }));
  }

  function onFile(event) {
    const picked = event.target.files?.[0];
    if (!picked) { setFile(null); return; }
    if (!IMAGE_EXT[picked.type]) { setMsg({ type: 'error', text: 'Use a JPG, PNG or WebP image.' }); event.target.value = ''; return; }
    if (picked.size > MAX_IMAGE_BYTES) { setMsg({ type: 'error', text: 'Image is larger than 5 MB. Use a smaller photo.' }); event.target.value = ''; return; }
    setMsg(null);
    setFile(picked);
  }

  async function removeImage(path) {
    if (isStoragePath(path)) await supabase.storage.from(PRODUCT_BUCKET).remove([path]);
  }

  async function save(event) {
    event.preventDefault();
    if (!supabaseConfigured) return;
    const price = Number(form.price);
    const stock = Number(form.stock === '' ? 0 : form.stock);
    const weight = form.weight_grams === '' ? null : Number(form.weight_grams);
    const baseLength = Number(form.base_length) || 16;
    if (!form.name.trim()) return setMsg({ type: 'error', text: 'Enter a product name.' });
    if (!form.slug.trim()) return setMsg({ type: 'error', text: 'Enter a slug.' });
    if (!Number.isFinite(price) || price < 0) return setMsg({ type: 'error', text: 'Enter a valid price.' });
    if (!Number.isInteger(stock) || stock < 0) return setMsg({ type: 'error', text: 'Stock must be a whole number, 0 or more.' });
    if (weight != null && (!Number.isInteger(weight) || weight <= 0)) return setMsg({ type: 'error', text: 'Weight must be a whole number of grams.' });

    setBusy(true);
    setMsg(null);
    let uploaded = null;
    try {
      let imagePath = form.image_path || null;
      if (file) {
        uploaded = `products/${crypto.randomUUID()}.${IMAGE_EXT[file.type]}`;
        const { error: upErr } = await supabase.storage.from(PRODUCT_BUCKET).upload(uploaded, file, {
          contentType: file.type, cacheControl: '31536000', upsert: false,
        });
        if (upErr) throw upErr;
        imagePath = uploaded;
      }
      const row = {
        name: form.name.trim(),
        slug: slugify(form.slug),
        category: form.category || null,
        price,
        stock,
        weight_grams: weight,
        base_length: baseLength,
        length_options: parseLengths(form.length_options),
        lace_options: parseList(form.lace_options),
        hair_type: form.hair_type.trim() || null,
        description: form.description.trim() || null,
        is_active: form.is_active,
        image_path: imagePath,
      };
      const query = form.id
        ? supabase.from('products').update(row).eq('id', form.id)
        : supabase.from('products').insert(row);
      const { error: saveErr } = await query;
      if (saveErr) throw saveErr;
      if (uploaded && form.image_path && form.image_path !== uploaded) await removeImage(form.image_path);
      setMsg({ type: 'ok', text: form.id ? 'Product updated.' : 'Product added.' });
      close();
      refresh?.();
    } catch (err) {
      if (uploaded) await removeImage(uploaded); // do not leave an orphaned upload behind
      setMsg({ type: 'error', text: friendlyError(err) });
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(product) {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from('products').update({ is_active: !product.is_active }).eq('id', product.id);
    setBusy(false);
    if (error) return setMsg({ type: 'error', text: friendlyError(error) });
    refresh?.();
  }

  async function remove(product) {
    if (!window.confirm(`Delete "${product.name}"? Past orders keep the product name. This cannot be undone.`)) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from('products').delete().eq('id', product.id);
    if (error) { setBusy(false); return setMsg({ type: 'error', text: friendlyError(error) }); }
    await removeImage(product.image_path);
    setBusy(false);
    setMsg({ type: 'ok', text: 'Product deleted.' });
    refresh?.();
  }

  const shownImage = preview || productImageUrl(form?.image_path);

  return (
    <div className="pm">
      {msg && <div className={`dash-alert${msg.type === 'ok' ? ' ok' : ''}`} role={msg.type === 'ok' ? 'status' : 'alert'}>{msg.text}</div>}

      {form && (
        <form className="dash-panel pm-form" onSubmit={save}>
          <div className="dash-panel-head">
            <h2>{form.id ? 'Edit product' : 'Add product'}</h2>
            <button className="btn btn-ghost" type="button" onClick={close} disabled={busy}>Cancel</button>
          </div>

          <div className="pm-photo">
            <div className="photo pm-thumb-lg">{shownImage && <img src={shownImage} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}</div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="pm-file">Product photo (JPG, PNG or WebP, max 5 MB)</label>
              <input id="pm-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} />
            </div>
          </div>

          <div className="pm-grid">
            <div className="field"><label htmlFor="pm-name">Name</label><input id="pm-name" value={form.name} onChange={(e) => onName(e.target.value)} required /></div>
            <div className="field"><label htmlFor="pm-slug">Slug</label><input id="pm-slug" value={form.slug} onChange={(e) => { setSlugTouched(true); set('slug', e.target.value); }} required /></div>
            <div className="field"><label htmlFor="pm-cat">Category</label>
              <select id="pm-cat" value={form.category} onChange={(e) => set('category', e.target.value)}>
                {categoryNames.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            <div className="field"><label htmlFor="pm-price">Price (₦, at listed length)</label><input id="pm-price" type="number" min="0" step="1" inputMode="numeric" value={form.price} onChange={(e) => set('price', e.target.value)} required /></div>
            <div className="field"><label htmlFor="pm-stock">Stock</label><input id="pm-stock" type="number" min="0" step="1" inputMode="numeric" value={form.stock} onChange={(e) => set('stock', e.target.value)} /></div>
            <div className="field"><label htmlFor="pm-weight">Weight (g)</label><input id="pm-weight" type="number" min="1" step="1" inputMode="numeric" value={form.weight_grams} onChange={(e) => set('weight_grams', e.target.value)} /></div>
            <div className="field"><label htmlFor="pm-base">Listed length (inches)</label><input id="pm-base" type="number" min="1" step="1" inputMode="numeric" value={form.base_length} onChange={(e) => set('base_length', e.target.value)} /></div>
            <div className="field"><label htmlFor="pm-hair">Hair type</label><input id="pm-hair" value={form.hair_type} onChange={(e) => set('hair_type', e.target.value)} /></div>
          </div>
          <div className="field"><label htmlFor="pm-lengths">Length options (inches, comma separated)</label><input id="pm-lengths" value={form.length_options} onChange={(e) => set('length_options', e.target.value)} /></div>
          <div className="field"><label htmlFor="pm-lace">Lace options (comma separated, leave empty if none)</label><input id="pm-lace" value={form.lace_options} onChange={(e) => set('lace_options', e.target.value)} placeholder="13×4 HD frontal, 5×5 HD closure" /></div>
          <div className="field"><label htmlFor="pm-desc">Description</label><textarea id="pm-desc" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
          <label className="pm-check"><input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} /> Published (visible in the shop)</label>

          <div className="pm-actions">
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : (form.id ? 'Save changes' : 'Add product')}</button>
            <button className="btn btn-ghost" type="button" onClick={close} disabled={busy}>Cancel</button>
          </div>
        </form>
      )}

      <div className="dash-panel">
        <div className="dash-panel-head">
          <h2>Products ({products.length})</h2>
          {!form && <button className="btn btn-primary" type="button" onClick={() => open(null)}>Add product</button>}
        </div>
        <div className="table-wrap">
          <table className="dash-table">
            <thead><tr><th></th><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Published</th><th></th></tr></thead>
            <tbody>
              {products.map((p) => {
                const thumb = productImageUrl(p.image_path);
                return (
                  <tr key={p.id}>
                    <td><div className="photo pm-thumb">{thumb && <img src={thumb} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}</div></td>
                    <td>{p.name}</td>
                    <td>{p.category || '—'}</td>
                    <td>{money(p.price)}</td>
                    <td>{p.stock ?? '—'}</td>
                    <td><button className="btn btn-ghost pm-small" type="button" disabled={busy} onClick={() => toggleActive(p)}>{p.is_active ? 'Live' : 'Hidden'}</button></td>
                    <td className="pm-row-actions">
                      <button className="btn btn-ghost pm-small" type="button" disabled={busy} onClick={() => open(p)}>Edit</button>
                      <button className="btn btn-ghost pm-small" type="button" disabled={busy} onClick={() => remove(p)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
              {!products.length && <tr><td colSpan={7} className="muted">No products yet. Use “Add product”.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
