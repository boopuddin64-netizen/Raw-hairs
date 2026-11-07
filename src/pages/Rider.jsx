import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { jobSteps } from '../data';
import { Chip } from '../components';

const ACTION = ['Start pickup', 'Confirm pickup', 'Confirm delivery', null];
const STATUS = ['Assigned', 'Picked up', 'On the way', 'Delivered'];

function RiderIcon({ type }) {
  const paths = {
    route: <><path d="M5 19c3-5 5-9 9-10 2-.5 4 .2 5 2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="11" r="2" /></>,
    package: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="M3 8v9l9 5 9-5V8M12 13v9" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[type]}</svg>;
}

export default function Rider() {
  const store = useStore();
  const { jobs } = store.state;
  const [filter, setFilter] = useState('All');
  const [activeJob, setActiveJob] = useState(jobs.find((j) => j.step < 3)?.id || '');
  const active = jobs.find((j) => j.id === activeJob);
  const completed = jobs.filter((j) => j.step === 3).length;
  const inProgress = jobs.filter((j) => j.step > 0 && j.step < 3).length;
  const filtered = useMemo(() => jobs.filter((j) => filter === 'All' || (filter === 'Active' ? j.step < 3 : j.step === 3)), [jobs, filter]);

  return <div className="rider-app">
    <header className="rider-topbar"><a href="#/" className="rider-logo"><span>R</span><b>RAW HAIRS</b></a><div className="rider-top-right"><span className="rider-demo-pill"><i /> DEMO DRIVER</span><span className="rider-profile">JD</span></div></header>
    <main className="rider-container">
      <div className="rider-heading"><div><span className="rider-eyebrow">DRIVER WORKSPACE / TODAY</span><h1>Good morning, Driver.</h1><p>Here’s your delivery run. One stop at a time.</p></div><div className="rider-date-card"><span>YOUR SHIFT</span><b>On duty</b><small>Demo schedule</small></div></div>
      <div className="rider-demo-banner"><span>i</span><p><b>Preview environment</b> — these are sample jobs. Actions update this browser only; no customer is contacted.</p></div>
      <section className="rider-stats"><article><span className="rider-stat-icon"><RiderIcon type="package" /></span><div><small>Assigned stops</small><b>{jobs.length.toString().padStart(2, '0')}</b></div></article><article><span className="rider-stat-icon"><RiderIcon type="route" /></span><div><small>In progress</small><b>{inProgress.toString().padStart(2, '0')}</b></div></article><article><span className="rider-stat-icon success"><RiderIcon type="check" /></span><div><small>Completed</small><b>{completed.toString().padStart(2, '0')}</b></div></article></section>
      <div className="rider-layout">
        <section className="rider-list-panel"><div className="rider-list-head"><div><span className="rider-eyebrow">YOUR ASSIGNMENTS</span><h2>Delivery queue <span>{jobs.length}</span></h2></div><div className="rider-filters">{['All', 'Active', 'Completed'].map((f) => <button key={f} className={filter === f ? 'selected' : ''} onClick={() => setFilter(f)}>{f}</button>)}</div></div>
          {filtered.length === 0 && <div className="rider-empty"><b>All clear</b><p>No deliveries in this filter.</p></div>}
          <div className="rider-job-list">{filtered.map((j) => <button key={j.id} className={'rider-job-card ' + (activeJob === j.id ? 'selected' : '')} onClick={() => setActiveJob(j.id)}><span className="rider-job-symbol"><RiderIcon type="package" /></span><span className="rider-job-main"><b>Delivery {j.id}</b><small>{j.customer}</small><small>{j.pack}</small></span><span className="rider-job-status"><Chip tone={j.step === 3 ? 'ok' : j.step === 2 ? 'warn' : 'info'}>{STATUS[j.step]}</Chip><small>{j.step === 3 ? 'Completed' : 'View details →'}</small></span></button>)}</div>
        </section>
        <section className="rider-detail-panel">{active ? <><div className="rider-detail-head"><div><span className="rider-eyebrow">STOP DETAILS</span><h2>{active.id}</h2></div><Chip tone={active.step === 3 ? 'ok' : 'info'}>{STATUS[active.step]}</Chip></div><div className="rider-map-preview"><div className="rider-map-grid" /><span className="rider-map-pin">⌖</span><div className="rider-map-caption"><small>DELIVERY DESTINATION</small><b>{active.address}</b><span>Route navigation integration pending</span></div></div><div className="rider-customer-card"><span className="rider-customer-avatar">{active.customer.slice(0, 1).toUpperCase()}</span><div><small>DELIVER TO</small><b>{active.customer}</b><span>Customer details are limited in this demo.</span></div></div><div className="rider-package-card"><span className="rider-package-icon"><RiderIcon type="package" /></span><div><small>PACKAGE CONTENTS</small><b>{active.pack}</b><span>Handle with care · Keep package secure</span></div></div><div className="rider-progress"><div className="rider-progress-head"><b>Delivery progress</b><span>{Math.round(active.step / 3 * 100)}%</span></div><div className="rider-progress-track"><i style={{ width: (active.step / 3 * 100) + '%' }} /></div><ol>{jobSteps.map((step, i) => <li key={step} className={i < active.step ? 'done' : i === active.step ? 'current' : ''}><span>{i < active.step ? '✓' : i + 1}</span><div><b>{step}</b><small>{i < active.step ? 'Completed' : i === active.step ? 'Current step' : 'Up next'}</small></div></li>)}</ol></div>{ACTION[active.step] ? <button className="rider-primary-action" onClick={() => store.advanceJob(active.id)}>{ACTION[active.step]} <span>→</span></button> : <div className="rider-complete-state"><RiderIcon type="check" /><b>Delivery completed</b><span>This sample job is fully delivered.</span></div>}</> : <div className="rider-empty"><b>Select a delivery</b><p>Choose a job from your queue to view its details.</p></div>}</section>
      </div>
      <footer className="rider-footer"><span>RAW HAIRS · DRIVER PORTAL</span><span>Need assistance? Contact your dispatcher.</span></footer>
    </main>
  </div>;
}
