import { Link, useParams } from 'react-router-dom';
import { policyLinks, helpContent, INSTAGRAM_URL } from '../data';

export default function Help() {
  const { topic } = useParams();
  const item = policyLinks.find((policy) => policy.id === topic);

  // Previously an unknown topic silently rendered the first policy page while
  // leaving the wrong URL in the address bar. Say so instead.
  if (!item) {
    return (
      <div className="wrap page" style={{ maxWidth: 680 }}>
        <h1>Help topic not found</h1>
        <p className="muted">That page does not exist. Choose a topic below.</p>
        <div className="trust" style={{ marginTop: 20 }}>
          {policyLinks.map((policy) => (
            <Link key={policy.id} to={`/help/${policy.id}`}>{policy.label}</Link>
          ))}
        </div>
      </div>
    );
  }

  const body = helpContent[item.id];

  return (
    <div className="wrap page" style={{ maxWidth: 680 }}>
      <h1>{item.label}</h1>
      {body ? (
        <p style={{ whiteSpace: 'pre-line', color: 'var(--soft)' }}>{body}</p>
      ) : (
        <div className="notice" style={{ margin: '12px 0 20px' }} role="status">
          <p>This page is being finalised and is not published yet.</p>
          <p className="muted small" style={{ marginTop: 6 }}>
            For anything urgent, message us on Instagram and we’ll help you directly.
          </p>
        </div>
      )}
      {item.id === 'contact' && (
        <p style={{ marginTop: 16 }}>
          <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer noopener">Message us on Instagram</a>
        </p>
      )}
      <div className="trust" style={{ marginTop: 28 }}>
        {policyLinks
          .filter((policy) => policy.id !== item.id)
          .map((policy) => <Link key={policy.id} to={`/help/${policy.id}`}>{policy.label}</Link>)}
      </div>
    </div>
  );
}
