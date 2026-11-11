/** Fallback catalogue shown when Supabase has no active products.
 *  Images are free-to-use Pexels photos matched to each style.
 *  Replace with real RAW HAIRS product photos via the admin panel.
 */

const img = (id) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=800`;

export const demoProducts = [
  // Straight
  {
    id: 'demo-straight-1',
    name: 'Classic Straight Lace Front',
    category: 'Straight',
    description: 'Silky straight lace front wig. Middle or side part. Natural hairline, heat-friendly.',
    price: 85000,
    stock: 6,
    image_url: img(6923383),
    is_active: true,
  },
  {
    id: 'demo-straight-2',
    name: 'Long Straight Closure Wig',
    category: 'Straight',
    description: 'Full straight closure unit. Sleek finish, perfect for everyday wear.',
    price: 72000,
    stock: 4,
    image_url: img(6923383),
    is_active: true,
  },
  {
    id: 'demo-straight-3',
    name: 'Straight Bob with Lace',
    category: 'Straight',
    description: 'Blunt straight bob. Chin to shoulder length, pre-plucked lace.',
    price: 58000,
    stock: 5,
    image_url: img(6923351),
    is_active: true,
  },

  // Body Wave
  {
    id: 'demo-body-1',
    name: 'Body Wave Lace Frontal',
    category: 'Body Wave',
    description: 'Soft body wave with natural movement. Lace frontal for a seamless look.',
    price: 92000,
    stock: 5,
    image_url: img(6923442),
    is_active: true,
  },
  {
    id: 'demo-body-2',
    name: 'Body Wave Closure Wig',
    category: 'Body Wave',
    description: 'Loose S-wave pattern. Easy to style straight or wavy.',
    price: 78000,
    stock: 7,
    image_url: img(6923442),
    is_active: true,
  },
  {
    id: 'demo-body-3',
    name: 'Long Body Wave with Highlights',
    category: 'Body Wave',
    description: 'Body wave with subtle highlights. Full and bouncy.',
    price: 105000,
    stock: 3,
    image_url: img(6923557),
    is_active: true,
  },

  // Curly
  {
    id: 'demo-curly-1',
    name: 'Deep Curly Lace Front',
    category: 'Curly',
    description: 'Defined deep curls. Full volume, natural texture.',
    price: 88000,
    stock: 4,
    image_url: img(6923442),
    is_active: true,
  },
  {
    id: 'demo-curly-2',
    name: 'Kinky Curly Afro Wig',
    category: 'Curly',
    description: 'Tight kinky curls for a natural afro look. Lightweight and full.',
    price: 65000,
    stock: 6,
    image_url: img(2005771),
    is_active: true,
  },
  {
    id: 'demo-curly-3',
    name: 'Loose Curly Closure',
    category: 'Curly',
    description: 'Soft loose curls. Easy everyday styling.',
    price: 74000,
    stock: 5,
    image_url: img(6923442),
    is_active: true,
  },

  // Bob
  {
    id: 'demo-bob-1',
    name: 'Blunt Bob Lace Front',
    category: 'Bob',
    description: 'Classic blunt bob. Sharp ends, middle part, lace front.',
    price: 62000,
    stock: 8,
    image_url: img(6923351),
    is_active: true,
  },
  {
    id: 'demo-bob-2',
    name: 'Layered Bob Wig',
    category: 'Bob',
    description: 'Soft layered bob with movement. Shoulder length.',
    price: 55000,
    stock: 6,
    image_url: img(6923351),
    is_active: true,
  },
  {
    id: 'demo-bob-3',
    name: 'Wavy Bob Closure',
    category: 'Bob',
    description: 'Textured wavy bob. Effortless and modern.',
    price: 59000,
    stock: 4,
    image_url: img(6923442),
    is_active: true,
  },

  // Colored
  {
    id: 'demo-colored-1',
    name: 'Honey Blonde Straight',
    category: 'Colored',
    description: 'Honey blonde straight lace front. Bright and bold.',
    price: 98000,
    stock: 3,
    image_url: img(6923557),
    is_active: true,
  },
  {
    id: 'demo-colored-2',
    name: 'Highlight Body Wave',
    category: 'Colored',
    description: 'Body wave with caramel highlights. Full lace frontal.',
    price: 112000,
    stock: 2,
    image_url: img(6923557),
    is_active: true,
  },
  {
    id: 'demo-colored-3',
    name: 'Burgundy Curly Wig',
    category: 'Colored',
    description: 'Rich burgundy curly unit. Statement colour, soft curls.',
    price: 89000,
    stock: 3,
    image_url: img(6923442),
    is_active: true,
  },
];
