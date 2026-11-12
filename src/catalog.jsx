import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, supabaseConfigured } from './lib/supabase';
import { productImageUrl } from './lib/images';
import { useStore } from './store';

export function useCatalog() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const store = useStore();

  useEffect(() => {
    let active = true;
    async function load() {
      // Production must never present sample inventory as real stock.
      if (!supabaseConfigured || !supabase) {
        if (active) {
          setProducts([]);
          setError('The RAW HAIRS catalogue is temporarily unavailable. Please try again later.');
          setLoading(false);
        }
        return;
      }

      const { data, error: queryError } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (!active) return;

      if (queryError) {
        setProducts([]);
        setError('The RAW HAIRS catalogue could not be loaded. Please refresh and try again.');
        setLoading(false);
        return;
      }

      if (!data || data.length === 0) {
        setProducts([]);
        setError('');
        setLoading(false);
        return;
      }

      const withImages = data.map((product) => ({ ...product, image_url: productImageUrl(product.image_path) }));
      setProducts(withImages);
      setLoading(false);
      if (store?.syncProductSnapshots) store.syncProductSnapshots(withImages);
    }
    load();
    return () => { active = false; };
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = async () => {
    setLoading(true);
    setTick((t) => t + 1);
  };

  return { products, loading, error, refresh };
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
      if (active) {
        setServices(data || []);
        setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  return { services, loading, error };
}

export const formatNaira = (value) => value == null
  ? 'Price on request'
  : new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(Number(value));

export const hideBrokenImage = (event) => { event.currentTarget.style.display = 'none'; };

export const productSpec = (product) => [
  product.base_length ? `${product.base_length}″` : null,
  product.weight_grams ? `${product.weight_grams}g` : null,
].filter(Boolean).join(' · ');

export function LiveProductCard({ product }) {
  return (
    <article className="card">
      <div className="card-media">
        <Link to={`/product/${product.id}`} aria-label={`View ${product.name}`}>
          <div
            className="photo fill"
            role={product.image_url ? undefined : 'img'}
            aria-label={product.image_url ? undefined : `Product photograph pending for ${product.name}`}
          >
            {product.image_url && <img src={product.image_url} alt={product.name} loading="lazy" onError={hideBrokenImage} />}
            <span className="photo-tag">{product.category || 'RAW HAIRS'}</span>
            {product.stock <= 0 && <span className="soldout">SOLD OUT</span>}
          </div>
        </Link>
      </div>
      <div className="card-body">
        <h3>{product.name}</h3>
        <span className="muted small">{[product.category || 'Wig collection', productSpec(product)].filter(Boolean).join(' · ')}</span>
        <span className="price">{formatNaira(product.price)}</span>
        <span className="muted small">
          {product.stock > 0
            ? (product.stock <= 2 ? 'Limited availability' : 'In stock')
            : 'Sold out'}
        </span>
        <Link to={`/product/${product.id}`} className="btn btn-primary">VIEW DETAILS</Link>
      </div>
    </article>
  );
}
