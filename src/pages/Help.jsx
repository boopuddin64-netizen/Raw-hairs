import { Link, useParams } from 'react-router-dom';
import { policyLinks, INSTAGRAM_URL } from '../data';

// Editable placeholders. Do NOT publish invented policies: replace with the owner's final wording.
const BODY = {
  contact: 'Phone / WhatsApp: [PHONE / WHATSAPP]\nEmail: [EMAIL]\nShop address: [SHOP ADDRESS]\nOpening hours: [HOURS]',
  faqs: '[Add the questions customers really ask, with the owner\'s answers.]',
  delivery: '[Delivery areas, delivery times and fees within Nigeria.]\n\nInternational orders: shipping cost, carrier and timing are agreed with the customer on WhatsApp before any shipping fee is charged.',
  returns: '[Returns, exchanges and refund rules. Add only what RAW HAIRS confirms.]',
  privacy: '[Privacy policy: what customer information is collected, why, and how long it is kept.]',
  terms: '[Terms and conditions of sale.]',
};

export default function Help() {
  const { topic } = useParams();
  const item = policyLinks.find((p) => p.id === topic) || policyLinks[0];
  return (
    <div className="wrap page" style={{ maxWidth: 680 }}>
      <h1>{item.label}</h1>
      <div className="notice" style={{ margin: '12px 0 20px' }}>Placeholder text. The owner supplies the final wording.</div>
      <p style={{ whiteSpace: 'pre-line', color: 'var(--soft)' }}>{BODY[item.id]}</p>
      {item.id === 'contact' && <p style={{ marginTop: 16 }}><a href={INSTAGRAM_URL} className="tap" target="_blank" rel="noreferrer noopener">Message us on Instagram</a></p>}
      <div className="trust" style={{ marginTop: 28 }}>
        {policyLinks.filter((p) => p.id !== item.id).map((p) => <Link key={p.id} to={`/help/${p.id}`}>{p.label}</Link>)}
      </div>
    </div>
  );
}
