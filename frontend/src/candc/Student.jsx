import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { candcApi } from "./api.js";
import { CANDC_PROFILE, categoryColor, profileVars } from "./profile.js";
import {
  chooseExplicitNone,
  completeCount,
  completeSet,
  percent,
  responseFor,
  responseLabels,
  stateLabels,
  toggleCategory,
} from "./model.js";

const TOKEN_TTL = 10 * 60 * 1000;

function participantToken(activityId) {
  const key = `gedl:candc:${activityId}:participant`;
  const now = Date.now();
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    if (stored?.token && now - stored.lastSeen < TOKEN_TTL) {
      localStorage.setItem(key, JSON.stringify({ token: stored.token, lastSeen: now }));
      return stored.token;
    }
  } catch {}
  const token = crypto.randomUUID?.() || `${now}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(key, JSON.stringify({ token, lastSeen: now }));
  return token;
}

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
  return <div className={`candc-context-block ${compact ? "compact" : ""}`}>
    {entries.map(([key, item]) => <div key={`${key}-${item}`}><span>{contextLabel(key)}</span><strong>{item}</strong></div>)}
  </div>;
}

function ResultBars({ config, itemId, aggregate }) {
  const labels = stateLabels(config);
  const ids = config.categories.map((category) => category.id);
  if (config.classification.explicit_none?.enabled) ids.push(config.classification.explicit_none.id);
  const total = aggregate.participant_count || aggregate.response_count || 0;
  return <div className="candc-bars">
    {ids.map((id, index) => {
      const n = aggregate.counts?.[itemId]?.[id] || 0;
      return <div className="candc-bar-row" key={id}>
        <span>{labels[id]}</span>
        <div className="candc-bar"><i style={{ width: `${percent(n, total)}%`, background: categoryColor(index) }} /></div>
        <b>{percent(n, total)}%</b>
      </div>;
    })}
  </div>;
}

function CaseCard({ item, number, children, compact = false }) {
  return <article className={`candc-case-card ${compact ? "compact" : ""}`}>
    {number != null && <div className="candc-case-number">Case {number}</div>}
    <ContextBlock value={item?.optional_context} compact={compact} />
    <blockquote>{item?.content}</blockquote>
    {children}
  </article>;
}

export default function CandCStudent() {
  const { id, alias } = useParams();
  const activityId = id || alias;
  const [activity, setActivity] = useState(null);
  const [session, setSession] = useState(null);
  const [trace, setTrace] = useState(null);
  const [aggregate, setAggregate] = useState(null);
  const [guidance, setGuidance] = useState(null);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState("intro");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resolutionState, setResolutionState] = useState("");
  const [revision, setRevision] = useState(null);
  const [token] = useState(() => participantToken(activityId));

  const config = activity?.config;

  async function refresh() {
    if (!session?.id) return;
    try {
      const [state, mine, group] = await Promise.all([
        candcApi.sessionState(session.id),
        candcApi.me(session.id, token),
        candcApi.aggregate(session.id),
      ]);
      setSession((prev) => ({ ...prev, ...state }));
      setTrace(mine);
      setAggregate(group);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const a = await candcApi.activity(activityId);
        if (cancelled) return;
        setActivity(a);
        const s = await candcApi.sessionForActivity(activityId);
        if (cancelled) return;
        setSession(s);
        const mine = await candcApi.me(s.id, token);
        const group = await candcApi.aggregate(s.id);
        if (!cancelled) {
          setTrace(mine);
          setAggregate(group);
          if (mine?.committed) setPhase("cases");
        }
      } catch (e) {
        if (!cancelled) setError(e.status === 404 ? "This activity is waiting to start." : e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [activityId, token]);

  useEffect(() => {
    if (!session?.id || trace?.completed) return undefined;
    const timer = setInterval(refresh, 1500);
    return () => clearInterval(timer);
  }, [session?.id, trace?.completed]);

  const working = trace?.working || {};
  const committed = trace?.committed;
  const done = config ? completeCount(config, working) : 0;
  const currentItem = config?.items?.[index];
  const currentResponse = currentItem ? responseFor(working, currentItem.id) : null;
  const diagnosticId = session?.diagnostic_item_id || aggregate?.diagnostic_item_id;
  const diagnosticItem = config?.items?.find((item) => item.id === diagnosticId);

  const changedOption = useMemo(() => {
    const option = guidance?.resolution?.options?.find((item) => item.id === resolutionState);
    return ["change", "change_classification", "change_tagging"].includes(option?.id);
  }, [guidance, resolutionState]);

  async function save(response) {
    if (!currentItem) return;
    setBusy(true); setError("");
    try {
      const result = await candcApi.saveItem(session.id, token, currentItem.id, response);
      setTrace((prev) => ({ ...prev, working: result.working }));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function commit() {
    setBusy(true); setError("");
    try {
      await candcApi.commit(session.id, token);
      setConfirming(false);
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function openGuidance() {
    setBusy(true); setError("");
    try {
      const g = await candcApi.guidance(session.id, token);
      setGuidance(g);
      setRevision(g.original);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function finish() {
    if (!resolutionState) return;
    setBusy(true); setError("");
    try {
      await candcApi.resolve(session.id, token, {
        resolution_state: resolutionState,
        ...(changedOption ? { revised: revision } : {}),
      });
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  if (!activity || !session || !trace || !config) {
    return <div className="candc-app" style={profileVars()}><main className="candc-loading"><p>{error || "Loading…"}</p></main></div>;
  }

  if (trace.completed) {
    return <div className="candc-app" style={profileVars()}><main className="candc-finish"><div className="candc-eyebrow">Done</div><h1>You’ve completed this activity.</h1><p>The important question is not whether everyone agrees. It is what our different readings reveal about the assumptions we bring to apparently ordinary language.</p></main></div>;
  }

  if (committed && !session.revealed) {
    return <div className="candc-app" style={profileVars()}><main className="candc-wait"><div className="candc-orbit"/><div className="candc-eyebrow">Choices submitted</div><h1>Your choices are locked in.</h1><p>We’ll compare how the room interpreted the cases shortly.</p><span className="candc-countnote">{aggregate?.response_count || 0} responses in</span></main></div>;
  }

  if (committed && session.revealed && guidance) {
    const original = guidance.original;
    const item = guidance.item || diagnosticItem;
    return <div className="candc-app" style={profileVars()}>
      <main className="candc-shell candc-student-shell">
        <header className="candc-student-header"><div className="candc-eyebrow">A case worth looking at again</div><h1>What might explain the different readings?</h1></header>
        <section className="candc-reflect-stack">
          <CaseCard item={item}><small className="candc-original-choice">Your original choice: {responseLabels(config, original).join(", ")}</small></CaseCard>
          <div className="candc-guidance-questions">{(guidance.guidance || []).map((block, i) => <div className="candc-question" key={i}>{block.text || block}</div>)}</div>
          <div className="candc-resolution candc-resolution-wide">
            <h2>{guidance.resolution.prompt || "Looking at it again, where are you now?"}</h2>
            <div className="candc-resolution-options">{guidance.resolution.options.map((option) => <button key={option.id} className={resolutionState === option.id ? "selected" : ""} onClick={() => { setResolutionState(option.id); setRevision(original); }}>{option.label}</button>)}</div>
            {changedOption && <div className="candc-revision"><p>Change the labels for this case only.</p>{config.categories.map((cat, i) => {
              const selected = revision?.category_ids?.includes(cat.id);
              return <button key={cat.id} className={selected ? "selected" : ""} style={{ "--cat": categoryColor(i, CANDC_PROFILE) }} onClick={() => setRevision(toggleCategory(config, revision, cat.id))}>{cat.label}</button>;
            })}{config.classification.explicit_none?.enabled && <button className={revision?.explicit_none ? "selected" : ""} onClick={() => setRevision(chooseExplicitNone(!revision?.explicit_none))}>{config.classification.explicit_none.label}</button>}</div>}
            {error && <p className="candc-error">{error}</p>}
            <button className="candc-primary candc-large-action" disabled={!resolutionState || busy} onClick={finish}>Finish</button>
          </div>
        </section>
      </main>
    </div>;
  }

  if (committed && session.revealed && aggregate?.revealed) {
    return <div className="candc-app" style={profileVars()}><main className="candc-shell candc-student-shell">
      <header className="candc-student-header"><div className="candc-eyebrow">How did the room read these cases?</div><h1>Look for where responses clustered — and where they differed.</h1></header>
      <section className="candc-results-list">{config.items.map((item, i) => <article className={`candc-result-card candc-result-card-context ${item.id === diagnosticId ? "focus" : ""}`} key={item.id}><div className="candc-case-number">Case {i + 1}</div><ContextBlock value={item.optional_context} compact/><h3>{item.content}</h3><ResultBars config={config} itemId={item.id} aggregate={aggregate}/></article>)}</section>
      {diagnosticItem && <div className="candc-focus-callout"><strong>This case produced the widest spread of responses.</strong><ContextBlock value={diagnosticItem.optional_context} compact/><span>{diagnosticItem.content}</span></div>}
      {error && <p className="candc-error">{error}</p>}
      <button className="candc-primary candc-large-action" disabled={busy} onClick={openGuidance}>Look more closely</button>
    </main></div>;
  }

  if (phase === "intro") {
    return <div className="candc-app" style={profileVars()}><main className="candc-entry-screen"><div className="candc-eyebrow">Language and Assumptions</div><h1>{activity.title}</h1><p>{config.entry.text}</p><p className="candc-entry-note">You can change your answers before you finish.</p><button className="candc-primary candc-large-action" onClick={() => setPhase("cases")}>Start</button></main></div>;
  }

  if (phase === "review") {
    return <div className="candc-app" style={profileVars()}><main className="candc-shell candc-student-shell">
      <header className="candc-student-header"><div className="candc-eyebrow">Review your choices</div><h1>Have a look across the full set before you finish.</h1><p>You can still change anything.</p></header>
      <section className="candc-review-list">{config.items.map((item, i) => <article className="candc-review-card" key={item.id}><div><div className="candc-case-number">Case {i + 1}</div><ContextBlock value={item.optional_context} compact/><h3>{item.content}</h3><p>{responseLabels(config, responseFor(working, item.id)).join(", ")}</p></div><button className="candc-secondary" onClick={() => { setIndex(i); setPhase("cases"); }}>Edit</button></article>)}</section>
      {!confirming ? <button className="candc-primary candc-large-action" disabled={!completeSet(config, working) || busy} onClick={() => setConfirming(true)}>Finish sorting</button> : <div className="candc-confirm-panel"><h2>Finish and submit these choices?</h2><p>You won’t be able to change them until the group comparison is shown.</p><div><button className="candc-secondary" onClick={() => setConfirming(false)}>Go back</button><button className="candc-primary" disabled={busy} onClick={commit}>Submit</button></div></div>}
      {error && <p className="candc-error">{error}</p>}
    </main></div>;
  }

  return <div className="candc-app" style={profileVars()}><main className="candc-shell candc-student-shell">
    <header className="candc-case-header"><div><div className="candc-eyebrow">Case {index + 1} of {config.items.length}</div><div className="candc-progress"><i style={{ width: `${((index + 1) / config.items.length) * 100}%` }}/></div></div></header>
    <CaseCard item={currentItem} number={index + 1}>
      <h2>{config.classification.prompt || "How would you classify this case?"}</h2>
      <div className="candc-tag-grid candc-tag-grid-single">{config.categories.map((category, i) => {
        const selected = currentResponse.category_ids.includes(category.id);
        return <button disabled={busy} key={category.id} className={selected ? "selected" : ""} style={{ "--cat": categoryColor(i, CANDC_PROFILE) }} onClick={() => save(toggleCategory(config, currentResponse, category.id))}>{category.label}</button>;
      })}{config.classification.explicit_none?.enabled && <button disabled={busy} className={`candc-none ${currentResponse.explicit_none ? "selected" : ""}`} onClick={() => save(chooseExplicitNone(!currentResponse.explicit_none))}>{config.classification.explicit_none.label}</button>}</div>
    </CaseCard>
    {error && <p className="candc-error">{error}</p>}
    <div className="candc-sequential-nav"><button className="candc-secondary" onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0}>Back</button><span>{done} of {config.items.length} answered</span><button className="candc-primary" disabled={!working[currentItem.id] || busy} onClick={() => { if (index === config.items.length - 1) setPhase("review"); else setIndex(index + 1); }}>{index === config.items.length - 1 ? "Review my choices" : "Next"}</button></div>
  </main></div>;
}
