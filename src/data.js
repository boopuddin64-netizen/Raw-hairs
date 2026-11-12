// Static site config only. Products and services load from Supabase.

export const INSTAGRAM_URL = 'https://www.instagram.com/raw.hairs';

// Category ids are the slugified products.category values (see Shop.jsx).
export const categories = [
  { id: 'bone-straight', name: 'Bone Straight' },
  { id: 'body-wave', name: 'Body Wave' },
  { id: 'loose-wave', name: 'Loose Wave' },
  { id: 'deep-wave', name: 'Deep Wave' },
  { id: 'water-wave', name: 'Water Wave' },
  { id: 'curly', name: 'Curly' },
  { id: 'colored', name: 'Colored' },
  { id: 'lace', name: 'Lace' },
  { id: 'ready-units', name: 'Ready units' },
];

export const policyLinks = [
  { id: 'contact', label: 'Contact' },
  { id: 'faqs', label: 'FAQs' },
  { id: 'delivery', label: 'Delivery & shipping' },
  { id: 'returns', label: 'Returns & refunds' },
  { id: 'privacy', label: 'Privacy policy' },
  { id: 'terms', label: 'Terms & conditions' },
];

export const jobSteps = ['Assigned to you', 'Picked up', 'On the way', 'Delivered and confirmed'];
