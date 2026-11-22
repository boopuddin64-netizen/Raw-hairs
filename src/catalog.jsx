import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatNaira } from './lib/money';
import { supabase, supabaseConfigured } from './lib/supabase';
import { productImageUrl } from './lib/images';
import { useStore } from './store';

const slugify = (value) => String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function deriveCategories(products) {
  const byName = new Map();
  products.forEach((product) => {
    const name = String(product.category || '').trim();
    if (!name) return;
    const slug = slugify(name);
    if (!byName.has(slug)) byName.set(slug, { id: slug, slug, name, product_type_id: product.product_type_id || null });
  });
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// The three metadata tables only exist once the catalog-flexibility migration
// is applied. Remember a failure for a while so repeat visits do not pay for
// three guaranteed 404s, but retry periodically so the app self-heals once the
// migration lands.
const META_RETRY_KEY = 'rawhairs:catalog-meta-retry-at';
const META_RETRY_MS = 6 * 60 * 60 * 1000;

function metaRetryAt() {
  try { return Number(localStorage.getItem(META_RETRY_KEY)) || 0; } catch { return 0; }
}
function rememberMetaUnavailable() {
  try { localStorage.setItem(META_RETRY_KEY, String(Date.now() + META_RETRY_MS)); } catch { /* ignore */ }
}
function clearMetaUnavailable() {
  try { localStorage.removeItem(META_RETRY_KEY); } catch { /* ignore */ }
}

export function useCatalog() {
  const [products, setProducts] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [attributeDefinitions, setAttributeDefinitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const store = useStore();

  useEffect(() => {
    let active = true;

    const enrich = (rows, types, categoryList) => {
      const typeById = new Map(types.map((type) => [type.id, type]));
      const categoryById = new Map(categoryList.map((category) => [category.id, category]));
      return rows.map((product) => ({
        ...product,
        category_label: categoryById.get(product.category_id)?.name || product.category || '',
        product_type_name: typeById.get(product.product_type_id)?.name || 'Product',
        product_type_slug: typeById.get(product.product_type_id)?.slug || '',
      }));
    };

    async function load() {
      if (!supabaseConfigured || !supabase) {
        if (active) {
          setProducts([]);
          setProductTypes([]);
          setCategories([]);
          setAttributeDefinitions([]);
          setError('The RAW HAIRS catalogue is temporarily unavailable. Please try again later.');
          setLoading(false);
        }
        return;
      }

      // Products are the critical path. Render them first so the storefront is
      // never blocked by the optional catalogue-metadata queries below.
      const productsResult = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(500);

      if (!active) return;
      if (productsResult.error) {
        setProducts([]);
        setError('The RAW HAIRS catalogue could not be loaded. Please refresh and try again.');
        setLoading(false);
        return;
      }

      const rows = (productsResult.data || []).map((product) => ({
        ...product,
        image_url: productImageUrl(product.image_path),
        gallery_urls: (Array.isArray(product.gallery_paths) ? product.gallery_paths : Array.isArray(product.gallery) ? product.gallery : [])
          .map((path) => productImageUrl(path) || path)
          .filter(Boolean),
      }));
      const derivedCategories = deriveCategories(rows);
      const initialProducts = enrich(rows, [], derivedCategories);

      setProducts(initialProducts);
      setCategories(derivedCategories);
      setError('');
      setLoading(false);
      if (store?.syncProductSnapshots) store.syncProductSnapshots(initialProducts);

      // Flexible-catalogue metadata is optional: the storefront falls back to
      // legacy `products.category` while these tables are unavailable.
      //
      // The metadata tables ship in the same migration as products.category_id
      // and products.product_type_id, so a populated catalogue can tell us
      // whether the migration is applied without spending three 404s.
      const hasMetadataColumns = (row) => 'category_id' in row && 'product_type_id' in row;
      if (rows.length > 0 && !rows.some(hasMetadataColumns)) {
        if (metaRetryAt() <= Date.now()) rememberMetaUnavailable();
        return;
      }
      if (metaRetryAt() > Date.now()) return;

      const [typesResult, categoriesResult, attributesResult] = await Promise.all([
        supabase.from('catalog_product_types').select('id,name,slug,sort_order').eq('is_active', true).order('sort_order').order('name'),
        supabase.from('catalog_categories').select('id,product_type_id,name,slug,sort_order').eq('is_active', true).order('sort_order').order('name'),
        supabase.from('catalog_attribute_definitions').select('id,product_type_id,key,label,field_type,options,is_required,display_in_specs,sort_order').eq('is_active', true).order('sort_order').order('label'),
      ]);

      if (!active) return;
      if (typesResult.error || categoriesResult.error || attributesResult.error) {
        rememberMetaUnavailable();
        return;
      }

      clearMetaUnavailable();
      const types = typesResult.data || [];
      const metadataCategories = categoriesResult.data || [];
      const categoryList = metadataCategories.length ? metadataCategories : derivedCategories;
      const enrichedProducts = enrich(rows, types, categoryList);

      setProducts(enrichedProducts);
      setProductTypes(types);
      setCategories(categoryList);
      setAttributeDefinitions(attributesResult.data || []);
      if (store?.syncProductSnapshots) store.syncProductSnapshots(enrichedProducts);
    }
    setLoading(true);
    load();
    return () => { active = false; };
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = async () => {
    setLoading(true);
    setTick((t) => t + 1);
  };

  return { products, productTypes, categories, attributeDefinitions, loading, error, refresh };
}

export function useServices() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabaseConfigured || !supabase) {
        if (active) {
          setError('Services are not connected yet.');
          setLoading(false);
        }
        return;
      }
      const { data, error: queryError } = await supabase
        .from('services')
        .select('id,name,description,price,duration_minutes,is_active,created_at')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (!active) return;
      if (queryError) {
        setError('Services could not be loaded. Please refresh and try again.');
        setLoading(false);
        return;
      }
      setServices(data || []);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);

  return { services, loading, error };
}

export const hideBrokenImage = (event) => { event.currentTarget.style.display = 'none'; };

export const productSpec = (product) => [
  product.base_length ? `${product.base_length}″` : null,
  product.weight_grams ? `${product.weight_grams}g` : null,
].filter(Boolean).join(' · ');

export function LiveProductCard({ product }) {
  return (
    <article className="card product-card">
      <div className="card-media">
        <Link to={`/product/${product.id}`} aria-label={`View ${product.name}`}>
          <div
            className="photo fill"
            role={product.image_url ? undefined : 'img'}
            aria-label={product.image_url ? undefined : `Product photograph pending for ${product.name}`}
          >
            {product.image_url && <img src={product.image_url} alt={`${product.name} product display`} loading="lazy" onError={hideBrokenImage} />}
            <span className="photo-tag">{product.category_label || product.product_type_name || 'RAW HAIRS'}</span>
            {product.stock <= 0 && <span className="soldout">SOLD OUT</span>}
          </div>
        </Link>
      </div>
      <div className="card-body">
        <span className="product-card-type">{product.product_type_name || 'Collection'}</span>
        <h3>{product.name}</h3>
        <span className="muted small">{[product.category_label || product.category, productSpec(product)].filter(Boolean).join(' · ')}</span>
        <span className="price">{formatNaira(product.price)}</span>
        <span className="muted small">{product.stock > 0 ? (product.stock <= 2 ? 'Limited availability' : 'In stock') : 'Sold out'}</span>
        <Link to={`/product/${product.id}`} className="btn btn-primary">View details</Link>
      </div>
    </article>
  );
}
