import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { candcApi } from "./api.js";
import { CANDC_PROFILE, categoryColor, profileVars } from "./profile.js";
import { percent, stateLabels } from "./model.js";

function contextLabel(key) {
  if (key === "setting") return "Setting";
  if (key === "target_or_subject") return "About";
  if (key === "situation") return "Context";
  return key.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function ContextBlock({ value, compact = false }) {
  if (!value) return null;
  const entries = Object.entries(value).filter(([, item]) => typeof item === "string" && item.trim());
  if (!entries.length) return null;
  return <div className={`candc-context-block ${compact ? "compact" : ""}`}>{entries.map(([key, item]) => <div key={`${key}-${item}`}><span>{contextLabel(key)}</span><strong>{item}</strong></div>)}</div>;
}

function stateRows(config, itemId, aggregate) {
  const labels = stateLabels(config);
  const ids = config.categories.map((category) => category.id);
  if (config.classification.explicit_none?.enabled) ids.push(config.classification.explicit_none.id);
  const total = aggregate.participant_count || aggregate.response_count || 0;
  return ids.map((id, index) => {
    const n = aggregate.counts?.[itemId]?.[id] || 0;
    return { id, label: labels[id], count: n, pct: percent(n, total), index };
  });
}

function Bars({ config, itemId, aggregate, large = false }) {
  const rows = stateRows(config, itemId, aggregate);
  return <div className={large ? "candc-bars candc-bars-large" : "candc-bars"}>{rows.map((row) => <div className="candc-bar-row" key={row.id}><span>{row.label}</span><div className="candc-bar"><i style={{ width: `${row.pct}%`, background: categoryColor(row.index, CANDC_PROFILE) }}/></div><b>{row.pct}%</b></div>)}</div>;
}

function TopResponses({ config, itemId, aggregate }) {
  const rows = stateRows(config, itemId, aggregate).sort((a, b) => b.count - a.count || a.index - b.index).slice(0, 2);
  return <div className="candc-top-responses">{rows.map((row) => <div key={row.id}><b>{row.pct}%</b><span>{row.label}</span></div>)}</div>;
}

export default function CandCPresentation() {
  const { id } = useParams();
  const [activity, setActivity] = useState(null);
  const [session, setSession] = useState(null);
  const [aggregate, setAggregate] = useState(null);
  const [error, setError] = useState("");
  const [focusedId, setFocusedId] = useState(null);
  const config = activity?.config;

  async function refresh() {
    try {
      const a = activity || await candcApi.activity(id);
      if (!activity) setActivity(a);
      const s = await candcApi.sessionForActivity(id);
      const group = await candcApi.aggregate(s.id);
      setSession(s); setAggregate(group);
    } catch (e) { setError(e.status === 404 ? "Waiting for the session to start." : e.message); }
  }

  useEffect(() => { refresh(); }, [id]);
  useEffect(() => { const timer = setInterval(refresh, 1200); return () => clearInterval(timer); }, [id, activity]);
  useEffect(() => {
    const handler = (event) => { if (event.key === "Escape") setFocusedId(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const focusedIndex = useMemo(() => config?.items?.findIndex((item) => item.id === focusedId) ?? -1, [config, focusedId]);
  const focusedItem = focusedIndex >= 0 ? config.items[focusedIndex] : null;

  if (!activity || !config || !session || !aggregate) return <div className="candc-app candc-presentation" style={profileVars()}><main className="candc-projector-wait"><p>{error || "Loading…"}</p></main></div>;

  const diagnostic = config.items.find((item) => item.id === aggregate.diagnostic_item_id);

  if (!session.revealed || !aggregate.revealed) {
    return <div className="candc-app candc-presentation" style={profileVars()}><main className="candc-projector-collect"><div className="candc-eyebrow">{activity.title}</div><h1>Complete the activity on your own device.</h1><div className="candc-projector-count">{aggregate.response_count || 0}</div><p>responses submitted</p></main></div>;
  }

  const moveFocus = (delta) => {
    if (!focusedItem) return;
    const next = (focusedIndex + delta + config.items.length) % config.items.length;
    setFocusedId(config.items[next].id);
  };

  return <div className="candc-app candc-presentation" style={profileVars()}><main className="candc-projector-results candc-gallery-view">
    <div className="candc-eyebrow">How did the group classify these cases?</div>
    <h1>Look for where responses clustered — and where they differed.</h1>
    <p className="candc-gallery-instruction">Select a case to look more closely at the response pattern.</p>
    <div className="candc-projector-grid candc-gallery-grid">{config.items.map((item, i) => <button key={item.id} type="button" className={`candc-gallery-card ${item.id === aggregate.diagnostic_item_id ? "diagnostic" : ""}`} onClick={() => setFocusedId(item.id)}>
      <div className="candc-case-number">Case {i + 1}</div>
      <ContextBlock value={item.optional_context} compact/>
      <h2>{item.content}</h2>
      <TopResponses config={config} itemId={item.id} aggregate={aggregate}/>
      <span className="candc-card-cta">View case</span>
    </button>)}</div>
    {diagnostic && <div className="candc-projector-note">The highlighted card produced the widest spread of responses.</div>}
  </main>
  {focusedItem && <div className="candc-focus-overlay" role="dialog" aria-modal="true" aria-label={`Case ${focusedIndex + 1}`} onClick={() => setFocusedId(null)}>
    <div className="candc-focus-panel" onClick={(event) => event.stopPropagation()}>
      <div className="candc-focus-toolbar"><span>Case {focusedIndex + 1} of {config.items.length}{focusedItem.id === aggregate.diagnostic_item_id ? " · widest response spread" : ""}</span><button onClick={() => setFocusedId(null)} aria-label="Close case">×</button></div>
      <section className="candc-focus-content">
        <article className="candc-focus-case"><ContextBlock value={focusedItem.optional_context}/><blockquote>{focusedItem.content}</blockquote></article>
        <div className="candc-focus-data"><h3>Room response</h3><Bars config={config} itemId={focusedItem.id} aggregate={aggregate} large/></div>
      </section>
      <div className="candc-focus-nav"><button className="candc-secondary" onClick={() => moveFocus(-1)}>← Previous</button><button className="candc-secondary" onClick={() => setFocusedId(null)}>Back to overview</button><button className="candc-primary" onClick={() => moveFocus(1)}>Next →</button></div>
    </div>
  </div>}
  </div>;
}
