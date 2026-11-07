// DEMO CATALOGUE ONLY. Product names, stock and specifications are illustrative.
// Replace every image with RAW HAIRS-owned or properly licensed product photography
// before launch. Prices remain null until the owner confirms the real price list.

export const INSTAGRAM_URL = 'https://www.instagram.com/raw.hairs/';

export const categories = [
  { id: 'straight', name: 'Bone Straight' }, { id: 'body-wave', name: 'Body Wave' },
  { id: 'water-wave', name: 'Water Wave' }, { id: 'deep-wave', name: 'Deep Wave' },
  { id: 'loose-wave', name: 'Loose Wave' }, { id: 'curly', name: 'Curly & Kinky' },
  { id: 'bob', name: 'Bob & Short Cuts' }, { id: 'colored', name: 'Colours & Highlights' },
];

const details = (texture, lace, colour = 'Natural black', density = '180% (sample)') => [
  ['Texture', texture], ['Lace', lace], ['Density', density],
  ['Hair type', 'Confirm with RAW HAIRS'], ['Colour', colour],
];

export const seed = {
  products: [
    { id:'p1', name:'Signature Body Wave', category:'body-wave', spec:'13x4 frontal', lengths:[18,20,22,24,26], stock:5, price:null, featured:true, isNew:true, available:true, image:'body', details:details('Body wave','13x4 HD lace') },
    { id:'p2', name:'Silk Bone Straight', category:'straight', spec:'5x5 closure', lengths:[20,22,24,26,28,30], stock:4, price:null, featured:true, isNew:true, available:true, image:'straight', details:details('Bone straight','5x5 HD closure') },
    { id:'p3', name:'Deep Wave Classic', category:'deep-wave', spec:'13x4 frontal', lengths:[16,18,20,22,24], stock:3, price:null, featured:true, isNew:true, available:true, image:'deep', details:details('Deep wave','13x4 lace') },
    { id:'p4', name:'Everyday Closure Bob', category:'bob', spec:'5x5 closure', lengths:[10,12,14,16], stock:8, price:null, featured:true, isNew:true, available:true, image:'bob', details:details('Straight bob','5x5 closure') },
    { id:'p5', name:'Water Wave Volume', category:'water-wave', spec:'13x4 frontal', lengths:[18,20,22,24], stock:4, price:null, featured:false, isNew:true, available:true, image:'water', details:details('Water wave','13x4 lace') },
    { id:'p6', name:'Honey Blonde Straight', category:'colored', spec:'13x4 frontal', lengths:[18,20,22,24,26], stock:2, price:null, featured:false, isNew:true, available:true, image:'blonde', details:details('Straight','13x4 lace','Honey blonde') },
    { id:'p7', name:'Kinky Curly Texture', category:'curly', spec:'5x5 closure', lengths:[14,16,18,20], stock:6, price:null, featured:false, isNew:false, available:true, image:'kinky', details:details('Kinky curly','5x5 closure') },
    { id:'p8', name:'Burgundy Sleek Bob', category:'colored', spec:'Closure', lengths:[10,12,14], stock:2, price:null, featured:false, isNew:false, available:true, image:'burgundy', details:details('Straight bob','Closure','Burgundy') },
    { id:'p9', name:'Loose Wave Luxe', category:'loose-wave', spec:'13x4 frontal', lengths:[18,20,22,24,26], stock:5, price:null, featured:true, isNew:false, available:true, image:'loose', details:details('Loose wave','13x4 frontal') },
    { id:'p10', name:'Natural Black Pixie', category:'bob', spec:'Glueless cap', lengths:[8,10,12], stock:3, price:null, featured:false, isNew:false, available:true, image:'pixie', details:details('Pixie cut','Glueless cap') },
    { id:'p11', name:'Water Wave Closure Unit', category:'water-wave', spec:'4x4 closure', lengths:[16,18,20,22], stock:4, price:null, featured:false, isNew:false, available:true, image:'water', details:details('Water wave','4x4 closure') },
    { id:'p12', name:'13x6 HD Frontal Straight', category:'straight', spec:'13x6 HD frontal', lengths:[20,22,24,26,28,30], stock:2, price:null, featured:true, isNew:false, available:true, image:'straight', details:details('Bone straight','13x6 HD frontal') },
    { id:'p13', name:'Ombre Brown Body Wave', category:'colored', spec:'13x4 frontal', lengths:[18,20,22,24], stock:3, price:null, featured:false, isNew:false, available:true, image:'ombre', details:details('Body wave','13x4 lace','Dark root / brown ombre') },
    { id:'p14', name:'Afro Kinky Coily Unit', category:'curly', spec:'Glueless cap', lengths:[12,14,16,18], stock:4, price:null, featured:false, isNew:false, available:true, image:'kinky', details:details('Afro kinky coily','Glueless cap') },
    { id:'p15', name:'Deep Wave 5x5 Closure', category:'deep-wave', spec:'5x5 closure', lengths:[16,18,20,22,24], stock:5, price:null, featured:false, isNew:false, available:true, image:'deep', details:details('Deep wave','5x5 closure') },
    { id:'p16', name:'Highlighted Bone Straight', category:'colored', spec:'13x4 frontal', lengths:[20,22,24,26], stock:1, price:null, featured:false, isNew:false, available:true, image:'highlight', details:details('Bone straight','13x4 lace','Dark root / honey highlight') },
  ],
  services: [
    { id:'s1', name:'Wig Washing & Conditioning', desc:'Deep cleanse, condition and gentle drying to refresh your unit.', price:null, status:'available', image:'wash' },
    { id:'s2', name:'Wig Revamping & Restyling', desc:'Bring back the shape, softness and movement of an existing wig.', price:null, status:'available', image:'revamp' },
    { id:'s3', name:'Lace Repair & Replacement', desc:'Assessment and repair for worn lace, small tears and lace damage.', price:null, status:'available', image:'lace' },
    { id:'s4', name:'Lace Customization', desc:'Plucking, knot tinting and hairline customization to your preference.', price:null, status:'available', image:'custom' },
    { id:'s5', name:'Wig Colouring & Toning', desc:'Colour refresh, toning and selected colour transformations after assessment.', price:null, status:'available', image:'colour' },
    { id:'s6', name:'Wig Installation', desc:'Professional fitting and styling for a neat, secure finish.', price:null, status:'available', image:'install' },
    { id:'s7', name:'Custom Wig Construction', desc:'Discuss a made-to-order unit, preferred texture, length and cap construction.', price:null, status:'available', image:'construct' },
    { id:'s8', name:'Wig Maintenance Consultation', desc:'Guidance on storage, detangling, washing frequency and everyday care.', price:null, status:'available', image:'care' },
  ],
  jobs: [
    { id:'D-0003', customer:'[CUSTOMER FIRST NAME]', address:'[DELIVERY ADDRESS]', pack:'1 wig', step:2 },
    { id:'D-0004', customer:'[CUSTOMER FIRST NAME]', address:'[DELIVERY ADDRESS]', pack:'1 wig', step:0 },
  ],
  riders: [{ id:'r1', name:'[RIDER NAME]', status:'active' }, { id:'r2', name:'[RIDER NAME]', status:'invited' }],
  orders: [
    { id:'#0003', items:'Signature Body Wave · 22 in', status:'Out for delivery', note:'Paid' },
    { id:'#0002', items:'Silk Bone Straight · 26 in', status:'Awaiting shipping quote', note:'International request' },
    { id:'#0001', items:'Everyday Closure Bob · 12 in', status:'Delivered', note:'Paid' },
  ],
  requests: [], bookings: [], cart: [], wishlist: [],
};

export const jobSteps = ['Assigned to you', 'Picked up', 'On the way', 'Delivered and confirmed'];
export const policyLinks = [
  { id:'contact', label:'Contact' }, { id:'faqs', label:'FAQs' },
  { id:'delivery', label:'Delivery & shipping' }, { id:'returns', label:'Returns & refunds' },
  { id:'privacy', label:'Privacy policy' }, { id:'terms', label:'Terms & conditions' },
];
