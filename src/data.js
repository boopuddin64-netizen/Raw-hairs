// SAMPLE DATA ONLY. Replace with real products, prices and policies from RAW HAIRS.
// price: null means "not set yet" and shows as a placeholder. Set prices in the Admin demo.

export const INSTAGRAM_URL = 'https://www.instagram.com/raw.hairs?obrf=MWhrc2kyc3BkbjN4aQ==';

export const categories = [
  { id: 'straight', name: 'Straight' },
  { id: 'body-wave', name: 'Body Wave' },
  { id: 'curly', name: 'Curly' },
  { id: 'bob', name: 'Bob' },
  { id: 'colored', name: 'Colored' },
];

export const seed = {
  products: [
    { id: 'p1', name: 'Body Wave Lace Wig', category: 'body-wave', spec: '13x4 lace', lengths: [18, 20, 22, 24], stock: 5, price: null, featured: true, isNew: true, available: true, details: [['Texture', 'Body wave'], ['Lace', '13x4 frontal'], ['Density', '[DENSITY]'], ['Hair type', '[HAIR TYPE]'], ['Colour', 'Natural black']] },
    { id: 'p2', name: 'Straight Bone Wig', category: 'straight', spec: '5x5 closure', lengths: [22, 26, 30], stock: 2, price: null, featured: true, isNew: true, available: true, details: [['Texture', 'Straight'], ['Lace', '5x5 closure'], ['Density', '[DENSITY]'], ['Hair type', '[HAIR TYPE]'], ['Colour', 'Natural black']] },
    { id: 'p3', name: 'Curly Full Lace', category: 'curly', spec: '13x6 lace', lengths: [16, 18, 20], stock: 0, price: null, featured: false, isNew: true, available: true, details: [['Texture', 'Curly'], ['Lace', '13x6 frontal'], ['Density', '[DENSITY]'], ['Hair type', '[HAIR TYPE]'], ['Colour', 'Natural black']] },
    { id: 'p4', name: 'Classic Bob Wig', category: 'bob', spec: 'Closure', lengths: [10, 12, 14], stock: 8, price: null, featured: true, isNew: true, available: true, details: [['Texture', 'Straight bob'], ['Lace', 'Closure'], ['Density', '[DENSITY]'], ['Hair type', '[HAIR TYPE]'], ['Colour', 'Natural black']] },
    { id: 'p5', name: 'Water Wave Wig', category: 'body-wave', spec: '13x4 lace', lengths: [18, 20, 22], stock: 4, price: null, featured: false, isNew: false, available: true, details: [['Texture', 'Water wave'], ['Lace', '13x4 frontal'], ['Density', '[DENSITY]'], ['Hair type', '[HAIR TYPE]'], ['Colour', 'Natural black']] },
    { id: 'p6', name: 'Honey Blonde Straight', category: 'colored', spec: '13x4 lace', lengths: [22, 24, 26], stock: 1, price: null, featured: false, isNew: false, available: true, details: [['Texture', 'Straight'], ['Lace', '13x4 frontal'], ['Density', '[DENSITY]'], ['Hair type', '[HAIR TYPE]'], ['Colour', 'Honey blonde']] },
    { id: 'p7', name: 'Deep Wave Wig', category: 'curly', spec: '5x5 closure', lengths: [16, 18, 20], stock: 6, price: null, featured: false, isNew: false, available: true, details: [['Texture', 'Deep wave'], ['Lace', '5x5 closure'], ['Density', '[DENSITY]'], ['Hair type', '[HAIR TYPE]'], ['Colour', 'Natural black']] },
    { id: 'p8', name: 'Burgundy Bob', category: 'colored', spec: 'Closure', lengths: [10, 12], stock: 0, price: null, featured: false, isNew: false, available: true, details: [['Texture', 'Straight bob'], ['Lace', 'Closure'], ['Density', '[DENSITY]'], ['Hair type', '[HAIR TYPE]'], ['Colour', 'Burgundy']] },
  ],
  services: [
    { id: 's1', name: 'Revamping', desc: 'Refresh a tired wig with a wash, tint and restyle.', price: null, status: 'available' },
    { id: 's2', name: 'Restoration', desc: 'Repair shedding, tangling and worn lace.', price: null, status: 'available' },
    { id: 's3', name: 'Customization', desc: 'Plucking, bleaching knots, cut and colour.', price: null, status: 'paused' },
    { id: 's4', name: '[Another service]', desc: 'Add only services RAW HAIRS confirms.', price: null, status: 'hidden' },
  ],
  jobs: [
    { id: 'D-0003', customer: '[CUSTOMER FIRST NAME]', address: '[DELIVERY ADDRESS]', pack: '1 wig', step: 2 },
    { id: 'D-0004', customer: '[CUSTOMER FIRST NAME]', address: '[DELIVERY ADDRESS]', pack: '1 wig', step: 0 },
  ],
  riders: [
    { id: 'r1', name: '[RIDER NAME]', status: 'active' },
    { id: 'r2', name: '[RIDER NAME]', status: 'invited' },
  ],
  orders: [
    { id: '#0003', items: 'Body Wave Lace Wig · 22 in', status: 'Out for delivery', note: 'Paid' },
    { id: '#0002', items: 'Straight Bone Wig · 26 in', status: 'Awaiting shipping quote', note: 'International request' },
    { id: '#0001', items: 'Classic Bob Wig · 12 in', status: 'Delivered', note: 'Paid' },
  ],
  requests: [],
  bookings: [],
  cart: [],
};

export const jobSteps = ['Assigned to you', 'Picked up', 'On the way', 'Delivered and confirmed'];

export const policyLinks = [
  { id: 'contact', label: 'Contact' },
  { id: 'faqs', label: 'FAQs' },
  { id: 'delivery', label: 'Delivery & shipping' },
  { id: 'returns', label: 'Returns & refunds' },
  { id: 'privacy', label: 'Privacy policy' },
  { id: 'terms', label: 'Terms & conditions' },
];
