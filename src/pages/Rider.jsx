import { useStore } from '../store';
import { jobSteps } from '../data';
import { Chip } from '../components';

const ACTION = ['START PICKUP', 'CONFIRM PICKED UP', 'CONFIRM DELIVERED', null];

export default function Rider() {
  const store = useStore();
  const { jobs } = store.state;
  return (
    <div className="wrap page" style={{ maxWidth: 560 }}>
      <p className="eyebrow">Rider · demo</p>
      <h1>Today's deliveries</h1>
      <p className="muted small" style={{ margin: '6px 0 12px' }}>Only deliveries assigned to you appear here.</p>
      <div className="notice" style={{ marginBottom: 16 }}>Concept demo with no sign-in. On the live site each rider signs in securely and sees only their own jobs, with just a first name, address, package and phone.</div>

      <div className="stack">
        {jobs.map((j) => (
          <article key={j.id} className="row-card" style={{ flexDirection: 'column', gap: 10, border: j.step === 2 ? '1px solid var(--pink)' : '1px solid var(--line)' }}>
            <div className="row-top"><h3 style={{ fontSize: 16 }}>Delivery {j.id}</h3><Chip tone={j.step === 3 ? 'ok' : j.step === 2 ? 'warn' : 'info'}>{jobSteps[j.step]}</Chip></div>
            <div><span className="muted small">Deliver to</span><br />{j.customer}<br /><span style={{ color: 'var(--soft)' }}>{j.address}</span></div>
            <div><span className="muted small">Package</span><br />{j.pack}</div>
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6, fontSize: 14 }}>
              {jobSteps.map((s, i) => (
                <li key={s} style={{ color: i < j.step ? 'var(--ok)' : i === j.step ? 'var(--pink)' : 'var(--muted)' }}>{i < j.step ? '✓' : i === j.step ? '●' : '○'} {s}</li>
              ))}
            </ol>
            {ACTION[j.step] && <button className="btn btn-primary btn-lg" onClick={() => store.advanceJob(j.id)}>{ACTION[j.step]}</button>}
          </article>
        ))}
      </div>
      <p className="muted small" style={{ marginTop: 16 }}>Riders never see product admin, payments, other riders' jobs or unrelated customers.</p>
    </div>
  );
}
