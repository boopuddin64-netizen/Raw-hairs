import { useState } from 'react';
import { adminApi } from '../../lib/adminApi';

const slugify = (value) => String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const makeKey = (value) => slugify(value).replace(/-/g, '_');
const parseOptions = (value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
const errorText = (error) => error?.message || 'Could not save catalogue settings.';

export default function CatalogStructureManager({ catalog, products = [], onSaved }) {
  const [typeForm, setTypeForm] = useState(null);
  const [categoryForm, setCategoryForm] = useState(null);
  const [attributeForm, setAttributeForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [problem, setProblem] = useState('');
  const types = catalog?.productTypes || [];
  const categories = catalog?.categories || [];
  const definitions = catalog?.attributeDefinitions || [];

  const startType = (type) => setTypeForm(type ? { id: type.id, name: type.name, slug: type.slug, sort_order: type.sort_order ?? 0, is_active: type.is_active } : { name: '', slug: '', sort_order: 0, is_active: true });
  const startCategory = (category) => setCategoryForm(category ? { id: category.id, product_type_id: category.product_type_id, name: category.name, slug: category.slug, sort_order: category.sort_order ?? 0, is_active: category.is_active } : { product_type_id: types.find((type) => type.is_active)?.id || '', name: '', slug: '', sort_order: 0, is_active: true });
  const startAttribute = (definition) => setAttributeForm(definition ? {
    id: definition.id, product_type_id: definition.product_type_id, key: definition.key, label: definition.label,
    field_type: definition.field_type, options: (definition.options || []).join(', '), originalOptions: definition.options || [], is_required: definition.is_required,
    display_in_specs: definition.display_in_specs, sort_order: definition.sort_order ?? 0,
    is_active: definition.is_active,
  } : {
    product_type_id: types.find((type) => type.is_active)?.id || '', key: '', label: '', field_type: 'text', options: '', originalOptions: [],
    is_required: false, display_in_specs: true, sort_order: 0, is_active: true,
  });

  async function save(table, form, values, editing) {
    setBusy(true);
    setNotice('');
    setProblem('');
    try {
      await adminApi.mutate(table, editing ? 'update' : 'insert', { id: editing || undefined, values });
      setNotice('Catalogue settings saved to the store database.');
      setTypeForm(null); setCategoryForm(null); setAttributeForm(null);
      await onSaved?.();
    } catch (error) {
      setProblem(errorText(error));
    } finally { setBusy(false); }
  }

  async function toggle(table, row) {
    setBusy(true); setNotice(''); setProblem('');
    try {
      await adminApi.mutate(table, 'update', { id: row.id, values: { is_active: !row.is_active } });
      setNotice(`${row.name || row.label} ${row.is_active ? 'archived' : 'restored'}.`);
      await onSaved?.();
    } catch (error) { setProblem(errorText(error)); }
    finally { setBusy(false); }
  }

  const activeTypes = types.filter((type) => type.is_active);
  return (
    <section className="catalog-structure" aria-labelledby="catalog-structure-title">
      <div className="catalog-structure-head"><div><p className="eyebrow">DATABASE-BACKED SETUP</p><h2 id="catalog-structure-title">Product types &amp; categories</h2><p className="muted small">Create types such as hair or accessories, organize categories, and define customer-safe product fields. No product SKUs are created here.</p></div></div>
      {problem && <div className="dash-alert" role="alert">{problem}</div>}
      {notice && <div className="dash-alert ok" role="status">{notice}</div>}

      <div className="catalog-structure-grid">
        <div className="catalog-structure-column">
          <div className="catalog-structure-title"><div><h3>Product types</h3><p className="muted small">Top-level catalogue groups</p></div><button className="btn btn-outline" type="button" onClick={() => startType(null)} disabled={busy}>Add type</button></div>
          {typeForm && <form className="catalog-editor-form" onSubmit={(event) => { event.preventDefault(); const values = { name: typeForm.name.trim(), sort_order: Number(typeForm.sort_order), is_active: typeForm.is_active }; if (!typeForm.id) values.slug = slugify(typeForm.slug); save('catalog_product_types', typeForm, values, typeForm.id); }}>
            <label>Name<input required maxLength={80} value={typeForm.name} onChange={(event) => setTypeForm((old) => ({ ...old, name: event.target.value, slug: old.id ? old.slug : slugify(event.target.value) }))} /></label>
            <label>URL slug<input required disabled={Boolean(typeForm.id)} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={typeForm.slug} onChange={(event) => setTypeForm((old) => ({ ...old, slug: event.target.value }))} /><span className="muted small">Stable once created; the display name remains editable.</span></label>
            <label>Display order<input type="number" min="0" max="10000" value={typeForm.sort_order} onChange={(event) => setTypeForm((old) => ({ ...old, sort_order: event.target.value }))} /></label>
            <div className="catalog-editor-actions"><button className="btn btn-primary" disabled={busy}>{typeForm.id ? 'Save type' : 'Create type'}</button><button className="btn btn-ghost" type="button" onClick={() => setTypeForm(null)}>Cancel</button></div>
          </form>}
          <div className="catalog-list">{types.map((type) => {
            const linked = products.some((product) => product.product_type_id === type.id && product.is_active !== false);
            return <article className={`catalog-list-row${!type.is_active ? ' archived' : ''}`} key={type.id}><div><strong>{type.name}</strong><span className="muted small">/{type.slug} · {categories.filter((category) => category.product_type_id === type.id).length} categories</span></div><div className="catalog-row-actions"><button className="btn btn-ghost pm-small" type="button" onClick={() => startType(type)} disabled={busy}>Edit</button><button className="btn btn-ghost pm-small" type="button" onClick={() => toggle('catalog_product_types', type)} disabled={busy || (type.is_active && linked)} title={linked ? 'Archive active products first' : undefined}>{type.is_active ? 'Archive' : 'Restore'}</button></div></article>;
          })}{types.length === 0 && <p className="muted small">No product types available.</p>}</div>
        </div>

        <div className="catalog-structure-column">
          <div className="catalog-structure-title"><div><h3>Categories</h3><p className="muted small">Categories belong to one product type</p></div><button className="btn btn-outline" type="button" onClick={() => startCategory(null)} disabled={busy || !activeTypes.length}>Add category</button></div>
          {categoryForm && <form className="catalog-editor-form" onSubmit={(event) => { event.preventDefault(); const values = { name: categoryForm.name.trim(), slug: slugify(categoryForm.slug), sort_order: Number(categoryForm.sort_order), is_active: categoryForm.is_active }; if (!categoryForm.id) values.product_type_id = categoryForm.product_type_id; save('catalog_categories', categoryForm, values, categoryForm.id); }}>
            <label>Product type<select required disabled={Boolean(categoryForm.id)} value={categoryForm.product_type_id} onChange={(event) => setCategoryForm((old) => ({ ...old, product_type_id: event.target.value }))}><option value="">Choose a type</option>{(categoryForm.id ? types : activeTypes).map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
            <label>Name<input required maxLength={100} value={categoryForm.name} onChange={(event) => setCategoryForm((old) => ({ ...old, name: event.target.value, slug: old.id ? old.slug : slugify(event.target.value) }))} /></label>
            <label>URL slug<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={categoryForm.slug} onChange={(event) => setCategoryForm((old) => ({ ...old, slug: event.target.value }))} /></label>
            <label>Display order<input type="number" min="0" max="10000" value={categoryForm.sort_order} onChange={(event) => setCategoryForm((old) => ({ ...old, sort_order: event.target.value }))} /></label>
            <div className="catalog-editor-actions"><button className="btn btn-primary" disabled={busy}>{categoryForm.id ? 'Save category' : 'Create category'}</button><button className="btn btn-ghost" type="button" onClick={() => setCategoryForm(null)}>Cancel</button></div>
          </form>}
          <div className="catalog-list">{categories.map((category) => {
            const linked = products.some((product) => product.category_id === category.id && product.is_active !== false);
            return <article className={`catalog-list-row${!category.is_active ? ' archived' : ''}`} key={category.id}><div><strong>{category.name}</strong><span className="muted small">{types.find((type) => type.id === category.product_type_id)?.name || 'Unlisted type'} · /{category.slug}</span></div><div className="catalog-row-actions"><button className="btn btn-ghost pm-small" type="button" onClick={() => startCategory(category)} disabled={busy}>Edit</button><button className="btn btn-ghost pm-small" type="button" onClick={() => toggle('catalog_categories', category)} disabled={busy || (category.is_active && linked)} title={linked ? 'Move active products before archiving' : undefined}>{category.is_active ? 'Archive' : 'Restore'}</button></div></article>;
          })}{categories.length === 0 && <p className="muted small">Create a category when you are ready to use one.</p>}</div>
        </div>

        <div className="catalog-structure-column catalog-attributes-column">
          <div className="catalog-structure-title"><div><h3>Custom product fields</h3><p className="muted small">Fields appear in the product editor for their type</p></div><button className="btn btn-outline" type="button" onClick={() => startAttribute(null)} disabled={busy || !activeTypes.length}>Add field</button></div>
          {attributeForm && <form className="catalog-editor-form" onSubmit={(event) => { event.preventDefault(); const options = attributeForm.field_type === 'select' ? [...new Set([...attributeForm.originalOptions, ...parseOptions(attributeForm.options)])] : []; const values = { label: attributeForm.label.trim(), options, is_required: Boolean(attributeForm.is_required), display_in_specs: Boolean(attributeForm.display_in_specs), sort_order: Number(attributeForm.sort_order), is_active: attributeForm.is_active }; if (!attributeForm.id) Object.assign(values, { key: makeKey(attributeForm.key || attributeForm.label), field_type: attributeForm.field_type, product_type_id: attributeForm.product_type_id }); save('catalog_attribute_definitions', attributeForm, values, attributeForm.id); }}>
            <label>Product type<select required disabled={Boolean(attributeForm.id)} value={attributeForm.product_type_id} onChange={(event) => setAttributeForm((old) => ({ ...old, product_type_id: event.target.value }))}><option value="">Choose a type</option>{(attributeForm.id ? types : activeTypes).map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
            <label>Field label<input required maxLength={100} value={attributeForm.label} onChange={(event) => setAttributeForm((old) => ({ ...old, label: event.target.value, key: old.id ? old.key : makeKey(event.target.value) }))} /></label>
            <label>Field key<input required disabled={Boolean(attributeForm.id)} pattern="[a-z][a-z0-9_]{0,39}" value={attributeForm.key} onChange={(event) => setAttributeForm((old) => ({ ...old, key: event.target.value }))} /></label>
            <label>Field type<select disabled={Boolean(attributeForm.id)} value={attributeForm.field_type} onChange={(event) => setAttributeForm((old) => ({ ...old, field_type: event.target.value }))}><option value="text">Text</option><option value="number">Number</option><option value="select">Choose from list</option><option value="boolean">Yes / no</option></select>{attributeForm.id && <span className="muted small">Stable once created. Archive and add a new field to change its type or key.</span>}</label>
            {attributeForm.field_type === 'select' && <><label>Options, separated by commas<input required value={attributeForm.options} onChange={(event) => setAttributeForm((old) => ({ ...old, options: event.target.value }))} placeholder="Option one, Option two" /></label>{attributeForm.id && <span className="muted small">Saved options stay available; you can add new choices without breaking existing products.</span>}</>}
            <label className="catalog-check"><input type="checkbox" checked={Boolean(attributeForm.is_required)} onChange={(event) => setAttributeForm((old) => ({ ...old, is_required: event.target.checked }))} /> Required when saving a product</label>
            <label className="catalog-check"><input type="checkbox" checked={Boolean(attributeForm.display_in_specs)} onChange={(event) => setAttributeForm((old) => ({ ...old, display_in_specs: event.target.checked }))} /> Include in visible product details</label>
            <span className="muted small">All saved attribute values remain in the public catalogue record; this setting only controls display on the product page. Do not store private notes here.</span>
            <label>Display order<input type="number" min="0" max="10000" value={attributeForm.sort_order} onChange={(event) => setAttributeForm((old) => ({ ...old, sort_order: event.target.value }))} /></label>
            <div className="catalog-editor-actions"><button className="btn btn-primary" disabled={busy}>{attributeForm.id ? 'Save field' : 'Create field'}</button><button className="btn btn-ghost" type="button" onClick={() => setAttributeForm(null)}>Cancel</button></div>
          </form>}
          <div className="catalog-list">{definitions.map((definition) => <article className={`catalog-list-row${!definition.is_active ? ' archived' : ''}`} key={definition.id}><div><strong>{definition.label}</strong><span className="muted small">{types.find((type) => type.id === definition.product_type_id)?.name || 'Unlisted type'} · {definition.field_type} · {definition.is_required ? 'required' : 'optional'}</span></div><div className="catalog-row-actions"><button className="btn btn-ghost pm-small" type="button" onClick={() => startAttribute(definition)} disabled={busy}>Edit</button><button className="btn btn-ghost pm-small" type="button" onClick={() => toggle('catalog_attribute_definitions', definition)} disabled={busy}>{definition.is_active ? 'Archive' : 'Restore'}</button></div></article>)}{definitions.length === 0 && <p className="muted small">No custom fields yet. Add only the details customers need to compare products.</p>}</div>
        </div>
      </div>
    </section>
  );
}
