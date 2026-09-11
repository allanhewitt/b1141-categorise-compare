import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { candcApi } from "./api.js";
import { copyText } from "./copy.js";
import { CANDC_PROFILE, categoryColor, profileVars } from "./profile.js";
import { percent, stateLabels } from "./model.js";

function contextLabel(key) {
  if (key === "setting") return "Setting";
  if (key === "target_or_subject") return "About";
  if (key === "situation") return "Context";
  return key.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function ContextBlock({ value }) {
  if (!value) return null;
  const entries = Object.entries(value).filter(([, item]) => typeof item === "string" && item.trim());
  if (!entries.length) return null;
  return <div className="candc-context-block compact">{entries.map(([key, item]) => <div key={`${key}-${item}`}><span>{contextLabel(key)}</span><strong>{item}</strong></div>)}</div>;
}

function Bars({ config, itemId, aggregate }) {
  const labels = stateLabels(config);
  const ids = config.categories.map((category) => category.id);
  if (config.classification.explicit_none?.enabled) ids.push(config.classification.explicit_none.id);
  const total = aggregate.participant_count || aggregate.response_count || 0;
  return <div className="candc-bars">{ids.map((id, index) => {
    const n = aggregate.counts?.[itemId]?.[id] || 0;
    return <div className="candc-bar-row" key={id}><span>{labels[id]}</span><div className="candc-bar"><i style={{ width: `${percent(n, total)}%`, background: categoryColor(index, CANDC_PROFILE) }}/></div><b>{percent(n, total)}%</b></div>;
  })}</div>;
}

export default function CandCLecturer() {
  const { id } = useParams();
  const [activity, setActivity] = useState(null);
  const [session, setSession] = useState(null);
  const [aggregate, setAggregate] = useState(null);
  const [key, setKey] = useState(() => sessionStorage.getItem("candc-lecturer-key") || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const config = activity?.config;

  async function refresh() {
    try {
      const a = activity || await candcApi.activity(id);
      if (!activity) setActivity(a);
      let s;
      try { s = await candcApi.sessionForActivity(id); }
      catch (e) { if (e.status === 404) { setSession(null); setAggregate(null); return; } throw e; }
      setSession(s);
      setAggregate(await candcApi.aggregate(s.id));
    } catch (e) { setError(e.message); }
  }

  useEffect(() => { refresh(); }, [id]);
  useEffect(() => {
    const timer = setInterval(refresh, 1500);
    return () => clearInterval(timer);
  }, [id, activity]);

  async function act(work) {
    if (key.length < 16) { setError("Enter the facilitator key first."); return; }
    setBusy(true); setError("");
    sessionStorage.setItem("candc-lecturer-key", key);
    try { await work(); await refresh(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  if (!activity || !config) return <div className="candc-app" style={profileVars()}><main className="candc-loading"><p>{error || "Loading…"}</p></main></div>;

  const diagnostic = config.items.find((item) => item.id === aggregate?.diagnostic_item_id);

  return <div className="candc-app" style={profileVars()}><main className="candc-shell candc-lecturer">
    <header className="candc-control-head"><div><div className="candc-eyebrow">Live control</div><h1>{activity.title}</h1></div><div className="candc-control-status"><span>{session ? (session.revealed ? "Group responses shown" : "Collecting responses") : "No open session"}</span></div></header>
    <section className="candc-control-grid">
      <aside className="candc-control-side">
        <div className="candc-metric"><b>{aggregate?.response_count || 0}</b><span>responses submitted</span></div>
        <label className="candc-key"><span>Facilitator key</span><input type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off"/></label>
        {!session && <div className="candc-control-block"><h3>Session</h3><p>Open a fresh session when the activity is ready to begin.</p><button className="candc-primary" disabled={busy} onClick={() => act(() => candcApi.openSession(id, key))}>Open session</button></div>}
        {session && !session.revealed && <div className="candc-control-block"><h3>Group responses</h3><p>The response pattern remains hidden until you release it to the room.</p><button className="candc-primary" disabled={busy || !aggregate?.response_count} onClick={() => act(() => candcApi.reveal(session.id, key))}>Show group responses</button></div>}
        {session && <div className="candc-control-block"><h3>Room view</h3><p>Open the projection view. Cards can be enlarged during discussion.</p><a className="candc-button-link" href={`/#/stage3/display/${id}`} target="_blank" rel="noreferrer">Open presentation</a></div>}
        {session && <div className="candc-control-block"><h3>Session</h3><button className="candc-secondary" disabled={busy} onClick={() => act(() => candcApi.close(session.id, key))}>End session</button></div>}
        {error && <p className="candc-error">{error}</p>}
      </aside>
      <div className="candc-control-main">
        {!session?.revealed || !aggregate?.revealed ? <div className="candc-hidden-state"><div className="candc-orbit"/><h2>Response pattern hidden</h2><p>You can see how many students have submitted without seeing how they classified the cases.</p></div> : <>
          <div className="candc-control-title"><div><h2>Group responses</h2><p>Each card now includes the context needed to interpret the statement.</p></div></div>
          <div className="candc-results-grid candc-lecturer-results">{config.items.map((item, i) => <article className={`candc-result-card candc-result-card-context ${item.id === aggregate.diagnostic_item_id ? "focus" : ""}`} key={item.id}><div className="candc-case-number">Case {i + 1}</div><ContextBlock value={item.optional_context}/><h3>{item.content}</h3><Bars config={config} itemId={item.id} aggregate={aggregate}/></article>)}</div>
          {diagnostic && <div className="candc-focus-callout candc-discussion-callout"><strong>Suggested discussion case</strong><ContextBlock value={diagnostic.optional_context}/><span>{diagnostic.content}</span><small>{copyText(config, "comparison.diagnostic_note", "This case produced the widest spread of responses.")} in the frozen group response.</small></div>}
        </>}
      </div>
    </section>
  </main></div>;
}
