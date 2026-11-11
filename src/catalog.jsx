import { useEffect, useState } from 'react';
import { supabase, supabaseConfigured } from './lib/supabase';

export function useCatalog() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabaseConfigured || !supabase) {
        if (active) { setError('The product catalogue is not connected yet.'); setLoading(false); }
        return;
      }
      const { data, error: queryError } = await supabase
        .from('products')
        .select('id,name,slug,description,category,price,stock,image_path,is_active,created_at')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (!active) return;
      if (queryError) setError('Products could not be loaded. Please refresh and try again.');
      else setProducts(data || []);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);

  return { products, loading, error };
}

export const formatNaira = (value) => value == null
  ? 'Price on request'
  : new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(Number(value));

export function LiveProductCard({ product }) {
  return (
    <article className="card">
      <div className="card-media">
        <a href={`#/product/${product.id}`} aria-label={`View ${product.name}`}>
          <div className="photo fill" role="img" aria-label={`Product photograph pending for ${product.name}`}>
            <span className="photo-tag">{product.category || 'RAW HAIRS'}</span>
          </div>
        </a>
      </div>
      <div className="card-body">
        <h3>{product.name}</h3>
        <span className="muted small">{product.category || 'Wig collection'}</span>
        <span className="price">{formatNaira(product.price)}</span>
        <span className="muted small">{product.stock > 0 ? (product.stock <= 2 ? 'Limited availability' : 'In stock') : 'Sold out'}</span>
        <a href={`#/product/${product.id}`} className="btn btn-primary">VIEW DETAILS</a>
      </div>
    </article>
  );
}
