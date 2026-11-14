import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../../lib/adminApi';
import { categories as legacyCategories } from '../../data';
import { isStoragePath, productImageUrl } from '../../lib/images';
import CatalogStructureManager from './CatalogStructureManager';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_GALLERY_IMAGES = 7;
const IMAGE_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const DEFAULT_LENGTHS = '12, 14, 16, 18, 20, 22, 24, 26';
const money = (value) => (value == null || Number.isNaN(Number(value)) ? '—' : '₦' + Number(value).toLocaleString('en-NG'));
const slugify = (value) => String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const parseList = (text) => String(text || '').split(',').map((value) => value.trim()).filter(Boolean);
const parseLengths = (text) => [...new Set(parseList(text).map(Number).filter((value) => Number.isInteger(value) && value > 0))].sort((a, b) => a - b);
const errorText = (error) => error?.message || 'Something went wrong. Please try again.';

function blank(catalog) {
  const type = (catalog?.productTypes || []).find((item) => item.slug === 'hair' && item.is_active)
    || (catalog?.productTypes || []).find((item) => item.is_active);
  const category = (catalog?.categories || []).find((item) => item.product_type_id === type?.id && item.is_active);
  return {
    id: null, name: '', slug: '', category: category?.name || legacyCategories[0]?.name || '',
    product_type_id: type?.id || '', category_id: category?.id || '', price: '', stock: '',
    weight_grams: '', base_length: '16', length_options: DEFAULT_LENGTHS, lace_options: '',
    hair_type: 'Raw Vietnamese', description: '', is_active: true, image_path: '', gallery_paths: [], attributes: {},
  };
}

const toForm = (product) => ({
  id: product.id, name: product.name || '', slug: product.slug || '', category: product.category || '',
  product_type_id: product.product_type_id || '', category_id: product.category_id || '',
  price: product.price ?? '', stock: product.stock ?? '', weight_grams: product.weight_grams ?? '',
  base_length: String(product.base_length ?? 16),
  length_options: (product.length_options?.length ? product.length_options : parseLengths(DEFAULT_LENGTHS)).join(', '),
  lace_options: (product.lace_options || []).join(', '), hair_type: product.hair_type || '',
  description: product.description || '', is_active: product.is_active !== false,
  image_path: product.image_path || '', gallery_paths: Array.isArray(product.gallery_paths) ? [...product.gallery_paths] : [],
  attributes: product.attributes && typeof product.attributes === 'object' && !Array.isArray(product.attributes) ? { ...product.attributes } : {},
});

export default function ProductsManager({ products = [], refresh }) {
  const [catalog, setCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [showStructure, setShowStructure] = useState(false);
  const [form, setForm] = useState(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [file, setFile] = useState(null);
  const [galleryFiles, setGalleryFiles] = useState([]);
  const [preview, setPreview] = useState('');
  const [galleryPreviews, setGalleryPreviews] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function loadCatalog() {
    setCatalogLoading(true);
    try {
      const data = await adminApi.catalog();
      setCatalog(data);
      setCatalogError('');
    } catch (error) {
      setCatalog(null);
      setCatalogError(errorText(error));
    } finally { setCatalogLoading(false); }
  }

  useEffect(() => { loadCatalog(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!file) { setPreview(''); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const urls = galleryFiles.map((image) => URL.createObjectURL(image));
    setGalleryPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [galleryFiles]);

  const catalogReady = Boolean(catalog?.productTypes);
  const activeTypes = (catalog?.productTypes || []).filter((type) => type.is_active || type.id === form?.product_type_id);
  const selectedType = activeTypes.find((type) => type.id === form?.product_type_id);
  const isHair = !catalogReady || selectedType?.slug === 'hair';
  const typeCategories = (catalog?.categories || []).filter((category) => category.product_type_id === form?.product_type_id && (category.is_active || category.id === form?.category_id));
  const typeDefinitions = (catalog?.attributeDefinitions || []).filter((definition) => definition.product_type_id === form?.product_type_id);
  const visibleDefinitions = typeDefinitions.filter((definition) => definition.is_active || Object.hasOwn(form?.attributes || {}, definition.key));
  const oldCategories = useMemo(() => {
    const names = new Set(legacyCategories.map((category) => category.name));
    products.forEach((product) => { if (product.category) names.add(product.category); });
    if (form?.category) names.add(form.category);
    return [...names];
  }, [products, form?.category]);

  const set = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
  const open = (product) => {
    setMsg(null); setFile(null); setGalleryFiles([]);
    setSlugTouched(Boolean(product));
    setForm(product ? toForm(product) : blank(catalog));
  };
  const close = () => { setForm(null); setFile(null); setGalleryFiles([]); };

  function onName(value) {
    setForm((previous) => ({ ...previous, name: value, slug: slugTouched ? previous.slug : slugify(value) }));
  }

  function onType(typeId) {
    const selected = (catalog?.productTypes || []).find((item) => item.id === typeId);
    const hair = selected?.slug === 'hair';
    const defaultCategory = (catalog?.categories || []).find((category) => category.product_type_id === typeId && category.is_active);
    setForm((previous) => ({
      ...previous,
      product_type_id: typeId,
      category_id: defaultCategory?.id || '',
      category: defaultCategory?.name || '',
      attributes: {},
      weight_grams: hair ? previous.weight_grams : '',
      base_length: hair ? (previous.base_length || '16') : '',
      length_options: hair ? (previous.length_options || DEFAULT_LENGTHS) : '',
      lace_options: hair ? previous.lace_options : '',
      hair_type: hair ? (previous.hair_type || 'Raw Vietnamese') : '',
    }));
  }

  function onFile(event) {
    const picked = event.target.files?.[0];
    event.target.value = '';
    if (!picked) { setFile(null); return; }
    if (!IMAGE_EXT[picked.type]) { setMsg({ type: 'error', text: 'Use a JPG, PNG or WebP image.' }); return; }
    if (picked.size <= 0 || picked.size > MAX_IMAGE_BYTES) { setMsg({ type: 'error', text: 'Image must be 5 MB or smaller.' }); return; }
    setMsg(null);
    setFile(picked);
  }

  function onGalleryFiles(event) {
    const picked = Array.from(event.target.files || []);
    event.target.value = '';
    const valid = picked.filter((image) => IMAGE_EXT[image.type] && image.size > 0 && image.size <= MAX_IMAGE_BYTES);
    if (valid.length !== picked.length) { setMsg({ type: 'error', text: 'Use JPG, PNG or WebP secondary photos, each 5 MB or smaller.' }); return; }
    if ((form?.gallery_paths?.length || 0) + galleryFiles.length + valid.length > MAX_GALLERY_IMAGES) { setMsg({ type: 'error', text: `A product can have up to ${MAX_GALLERY_IMAGES} secondary photos.` }); return; }
    setMsg(null);
    setGalleryFiles((previous) => [...previous, ...valid]);
  }

  async function removeImage(path) {
    if (isStoragePath(path)) { try { await adminApi.removeImage(path); } catch { /* old image can be cleaned up separately */ } }
  }

  function prepareAttributes() {
    const result = {};
    for (const definition of typeDefinitions) {
      const raw = form.attributes?.[definition.key];
      if (raw == null || raw === '') continue;
      if (definition.field_type === 'number') result[definition.key] = Number(raw);
      else if (definition.field_type === 'boolean') result[definition.key] = Boolean(raw);
      else result[definition.key] = String(raw);
    }
    return result;
  }

  async function save(event) {
    event.preventDefault();
    const price = Number(form.price);
    const stock = Number(form.stock === '' ? 0 : form.stock);
    const weight = form.weight_grams === '' ? null : Number(form.weight_grams);
    const baseLength = form.base_length === '' ? null : Number(form.base_length);
    if (!form.name.trim()) return setMsg({ type: 'error', text: 'Enter a product name.' });
    if (!slugify(form.slug)) return setMsg({ type: 'error', text: 'Enter a valid product slug.' });
    if (!Number.isFinite(price) || price < 0) return setMsg({ type: 'error', text: 'Enter a valid price.' });
    if (!Number.isInteger(stock) || stock < 0) return setMsg({ type: 'error', text: 'Stock must be a whole number, 0 or more.' });
    if (weight != null && (!Number.isInteger(weight) || weight <= 0)) return setMsg({ type: 'error', text: 'Weight must be a whole number of grams.' });
    if (isHair && (!Number.isInteger(baseLength) || baseLength < 1 || baseLength > 240)) return setMsg({ type: 'error', text: 'Enter a valid listed length for this hair product.' });
    if (catalogReady && !form.product_type_id) return setMsg({ type: 'error', text: 'Choose a product type.' });
    const attributes = catalogReady ? prepareAttributes() : {};
    for (const definition of typeDefinitions) {
      if (definition.is_active && definition.is_required && (attributes[definition.key] == null || attributes[definition.key] === '')) return setMsg({ type: 'error', text: `${definition.label} is required.` });
      if (definition.field_type === 'select' && attributes[definition.key] != null && !(definition.options || []).includes(attributes[definition.key])) return setMsg({ type: 'error', text: `Choose a valid ${definition.label}.` });
      if (definition.field_type === 'number' && attributes[definition.key] != null && !Number.isFinite(attributes[definition.key])) return setMsg({ type: 'error', text: `${definition.label} must be a valid number.` });
    }

    setBusy(true); setMsg(null);
    const uploaded = [];
    try {
      let imagePath = form.image_path || null;
      if (file) { imagePath = await adminApi.uploadProductImage(file); uploaded.push(imagePath); }
      let galleryPaths = [...(form.gallery_paths || [])];
      for (const image of galleryFiles) {
        const path = await adminApi.uploadProductImage(image);
        uploaded.push(path);
        galleryPaths.push(path);
      }
      const chosenCategory = typeCategories.find((category) => category.id === form.category_id);
      const row = {
        name: form.name.trim(), slug: slugify(form.slug), category: catalogReady ? (chosenCategory?.name || null) : (form.category || null),
        price, stock, weight_grams: isHair ? weight : null,
        base_length: isHair ? baseLength : null,
        length_options: isHair ? parseLengths(form.length_options) : [],
        lace_options: isHair ? parseList(form.lace_options) : [],
        hair_type: isHair ? (form.hair_type.trim() || null) : null,
        description: form.description.trim() || null, is_active: form.is_active, image_path: imagePath,
      };
      if (catalogReady) Object.assign(row, {
        product_type_id: form.product_type_id,
        category_id: form.category_id || null,
        attributes,
        gallery_paths: galleryPaths,
      });

      await adminApi.mutate('products', form.id ? 'update' : 'insert', { id: form.id || undefined, values: row });
      const old = products.find((product) => product.id === form.id);
      if (file && old?.image_path && old.image_path !== imagePath) await removeImage(old.image_path);
      if (catalogReady && old) for (const oldPath of old.gallery_paths || []) if (!galleryPaths.includes(oldPath)) await removeImage(oldPath);
      setMsg({ type: 'ok', text: form.id ? 'Product updated in the store database.' : 'Product added to the store database.' });
      close();
      refresh?.();
    } catch (error) {
      for (const path of uploaded) await removeImage(path);
      setMsg({ type: 'error', text: errorText(error) });
    } finally { setBusy(false); }
  }

  async function toggleActive(product) {
    setBusy(true); setMsg(null);
    try {
      await adminApi.mutate('products', 'update', { id: product.id, values: { is_active: !product.is_active } });
      refresh?.();
    } catch (error) { setMsg({ type: 'error', text: errorText(error) }); }
    finally { setBusy(false); }
  }

  const shownImage = preview || productImageUrl(form?.image_path);
  const originalGallery = (form?.gallery_paths || []).map((path) => ({ path, url: productImageUrl(path) || path }));

  return (
    <div className="pm">
      {msg && <div className={`dash-alert${msg.type === 'ok' ? ' ok' : ''}`} role={msg.type === 'ok' ? 'status' : 'alert'}>{msg.text}</div>}
      {catalogError && <div className="catalog-migration-note" role="status"><strong>Advanced catalogue setup is waiting on its database migration.</strong><span>Existing products remain editable. New products, managed types/categories, custom attributes and secondary galleries become available after the migration is reviewed and applied.</span><button className="btn btn-ghost pm-small" type="button" onClick={loadCatalog} disabled={catalogLoading}>Check again</button></div>}
      {catalogReady && <div className="catalog-controls-launch"><div><p className="eyebrow">FLEXIBLE CATALOGUE</p><h3>Manage product structure</h3><p className="muted small">Manage product types, categories, and type-specific attributes in the database.</p></div><button className="btn btn-outline" type="button" onClick={() => setShowStructure((value) => !value)}>{showStructure ? 'Hide catalogue setup' : 'Manage catalogue setup'}</button></div>}
      {showStructure && catalogReady && <CatalogStructureManager catalog={catalog} products={products} onSaved={loadCatalog} />}

      {form && (
        <form className="dash-panel pm-form" onSubmit={save}>
          <div className="dash-panel-head"><div><p className="eyebrow">STORE CATALOGUE</p><h2>{form.id ? 'Edit product' : 'Add product'}</h2></div><button className="btn btn-ghost" type="button" onClick={close} disabled={busy}>Cancel</button></div>
          <div className="pm-photo">
            <div className="photo pm-thumb-lg">{shownImage && <img src={shownImage} alt="Main product display preview" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}</div>
            <div className="pm-photo-copy"><strong>Main product photo</strong><span className="muted small">Choose the mannequin head, ready unit, or hair bundles displayed on a clean background as the primary image.</span><label className="field" htmlFor="pm-file">Primary image · JPG, PNG or WebP · max 5 MB<input id="pm-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} /></label></div>
          </div>
          {catalogReady && <div className="pm-gallery-editor"><div><strong>Swipe gallery · optional</strong><p className="muted small">Add up to {MAX_GALLERY_IMAGES} secondary photos. If you include a model, it will follow the product-first main photo.</p></div><label className="btn btn-outline file-button" htmlFor="pm-gallery">Add secondary photos<input id="pm-gallery" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onGalleryFiles} /></label><div className="pm-gallery-thumbs">{originalGallery.map((image) => <div className="pm-gallery-thumb" key={image.path}>{image.url && <img src={image.url} alt="Secondary product image" />}<button type="button" aria-label="Remove secondary image" onClick={() => set('gallery_paths', form.gallery_paths.filter((path) => path !== image.path))}>×</button></div>)}{galleryPreviews.map((url, index) => <div className="pm-gallery-thumb" key={url}><img src={url} alt={`New secondary photo ${index + 1}`} /><button type="button" aria-label="Remove new secondary image" onClick={() => setGalleryFiles((items) => items.filter((_, i) => i !== index))}>×</button></div>)}</div></div>}

          <div className="pm-grid">
            <div className="field"><label htmlFor="pm-name">Product name</label><input id="pm-name" value={form.name} onChange={(event) => onName(event.target.value)} maxLength={160} required /></div>
            <div className="field"><label htmlFor="pm-slug">URL slug</label><input id="pm-slug" value={form.slug} onChange={(event) => { setSlugTouched(true); set('slug', event.target.value); }} required /></div>
            {catalogReady ? <>
              <div className="field"><label htmlFor="pm-type">Product type</label><select id="pm-type" value={form.product_type_id} onChange={(event) => onType(event.target.value)} required><option value="">Choose a type</option>{activeTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></div>
              <div className="field"><label htmlFor="pm-cat">Category</label><select id="pm-cat" value={form.category_id} onChange={(event) => { const category = typeCategories.find((item) => item.id === event.target.value); setForm((previous) => ({ ...previous, category_id: event.target.value, category: category?.name || '' })); }}><option value="">No category</option>{typeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.is_active ? '' : ' · archived'}</option>)}</select><span className="muted small">Add new categories from “Manage catalogue setup”.</span></div>
            </> : <div className="field"><label htmlFor="pm-cat">Category</label><select id="pm-cat" value={form.category} onChange={(event) => set('category', event.target.value)}>{oldCategories.map((name) => <option key={name} value={name}>{name}</option>)}</select></div>}
            <div className="field"><label htmlFor="pm-price">Price (₦)</label><input id="pm-price" type="number" min="0" step="1" inputMode="numeric" value={form.price} onChange={(event) => set('price', event.target.value)} required /></div>
            <div className="field"><label htmlFor="pm-stock">Stock</label><input id="pm-stock" type="number" min="0" step="1" inputMode="numeric" value={form.stock} onChange={(event) => set('stock', event.target.value)} /></div>
            {isHair && <>
              <div className="field"><label htmlFor="pm-weight">Weight (g)</label><input id="pm-weight" type="number" min="1" step="1" inputMode="numeric" value={form.weight_grams} onChange={(event) => set('weight_grams', event.target.value)} /></div>
              <div className="field"><label htmlFor="pm-base">Listed length (inches)</label><input id="pm-base" type="number" min="1" max="240" step="1" inputMode="numeric" value={form.base_length} onChange={(event) => set('base_length', event.target.value)} /></div>
              <div className="field"><label htmlFor="pm-hair">Hair type</label><input id="pm-hair" value={form.hair_type} onChange={(event) => set('hair_type', event.target.value)} /></div>
            </>}
          </div>
          {isHair && <div className="pm-legacy-hair-fields"><p className="eyebrow">HAIR OPTIONS</p><div className="field"><label htmlFor="pm-lengths">Available lengths in inches, comma separated</label><input id="pm-lengths" value={form.length_options} onChange={(event) => set('length_options', event.target.value)} /></div><div className="field"><label htmlFor="pm-lace">Lace options, comma separated</label><input id="pm-lace" value={form.lace_options} onChange={(event) => set('lace_options', event.target.value)} placeholder="13×4 HD frontal, 5×5 HD closure" /></div></div>}
          {catalogReady && typeDefinitions.length > 0 && <div className="pm-attributes"><p className="eyebrow">TYPE-SPECIFIC DETAILS</p><div className="pm-grid">{visibleDefinitions.map((definition) => {
            const value = form.attributes?.[definition.key];
            const archived = !definition.is_active;
            return <div className="field" key={definition.id}><label htmlFor={`pm-attr-${definition.key}`}>{definition.label}{definition.is_required && !archived ? ' *' : ''}{archived ? ' · archived' : ''}</label>{definition.field_type === 'select' ? <select id={`pm-attr-${definition.key}`} disabled={archived} required={definition.is_required && !archived} value={value ?? ''} onChange={(event) => setForm((previous) => ({ ...previous, attributes: { ...previous.attributes, [definition.key]: event.target.value } }))}><option value="">Choose…</option>{(definition.options || []).map((option) => <option value={option} key={option}>{option}</option>)}</select> : definition.field_type === 'boolean' ? <select id={`pm-attr-${definition.key}`} disabled={archived} value={value == null ? '' : String(value)} onChange={(event) => setForm((previous) => ({ ...previous, attributes: { ...previous.attributes, [definition.key]: event.target.value === '' ? '' : event.target.value === 'true' } }))}><option value="">Choose…</option><option value="true">Yes</option><option value="false">No</option></select> : <input id={`pm-attr-${definition.key}`} type={definition.field_type === 'number' ? 'number' : 'text'} disabled={archived} required={definition.is_required && !archived} value={value ?? ''} onChange={(event) => setForm((previous) => ({ ...previous, attributes: { ...previous.attributes, [definition.key]: event.target.value } }))} />}</div>;
          })}</div></div>}
          <div className="field"><label htmlFor="pm-desc">Description</label><textarea id="pm-desc" rows={4} maxLength={6000} value={form.description} onChange={(event) => set('description', event.target.value)} /></div>
          <label className="pm-check"><input type="checkbox" checked={form.is_active} onChange={(event) => set('is_active', event.target.checked)} /> Published (visible in the shop)</label>
          <div className="pm-actions"><button className="btn btn-primary" type="submit" disabled={busy || catalogLoading}>{busy ? 'Saving…' : (form.id ? 'Save product' : 'Add product')}<span className="sr-only"> to database</span></button><button className="btn btn-ghost" type="button" onClick={close} disabled={busy}>Cancel</button></div>
        </form>
      )}

      <div className="dash-panel">
        <div className="dash-panel-head"><div><p className="eyebrow">DATABASE CATALOGUE</p><h2>Products <span className="muted small">({products.length})</span></h2></div>{!form && <button className="btn btn-primary" type="button" onClick={() => open(null)} disabled={!catalogReady || catalogLoading} title={!catalogReady ? 'Apply the flexible catalogue migration before adding products' : undefined}>Add product</button>}</div>
        <div className="table-wrap"><table className="dash-table product-admin-table">
          <thead><tr><th></th><th>Name</th><th>Type / category</th><th>Price</th><th>Stock</th><th>Visibility</th><th>Actions</th></tr></thead>
          <tbody>{products.map((product) => {
            const thumb = productImageUrl(product.image_path);
            const type = catalog?.productTypes?.find((item) => item.id === product.product_type_id)?.name;
            return <tr key={product.id}><td><div className="photo pm-thumb">{thumb && <img src={thumb} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}</div></td><td><strong>{product.name}</strong><span className="muted small product-admin-slug">/{product.slug}</span></td><td>{type && <span className="product-admin-type">{type}</span>}{product.category || '—'}</td><td>{money(product.price)}</td><td>{product.stock ?? '—'}</td><td><button className={`visibility-pill${product.is_active ? ' live' : ''}`} type="button" disabled={busy} onClick={() => toggleActive(product)}>{product.is_active ? 'Published' : 'Hidden'}</button></td><td><button className="btn btn-outline pm-small" type="button" disabled={busy} onClick={() => open(product)}>Edit</button></td></tr>;
          })}{!products.length && <tr><td colSpan={7} className="muted">No products yet. Use “Add product” to publish the first item.</td></tr>}</tbody>
        </table></div>
      </div>
    </div>
  );
}
