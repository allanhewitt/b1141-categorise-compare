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

function Context({ value }) {
  if (!value) return null;
  const parts = Object.values(value).filter((item) => typeof item === "string" && item.trim());
  if (!parts.length) return null;
  return <div className="candc-context">{parts.map((part) => <span key={part}>{part}</span>)}</div>;
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

export default function CandCStudent() {
  const { id, alias } = useParams();
  const activityId = id || alias;
  const [activity, setActivity] = useState(null);
  const [session, setSession] = useState(null);
  const [trace, setTrace] = useState(null);
  const [aggregate, setAggregate] = useState(null);
  const [guidance, setGuidance] = useState(null);
  const [index, setIndex] = useState(0);
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
    return <div className="candc-app" style={profileVars()}><main className="candc-finish"><div className="candc-eyebrow">Done</div><h1>You’re finished with this activity.</h1><p>The useful part was not whether everybody agreed. It was seeing where the same cases became difficult to read in only one way.</p></main></div>;
  }

  if (committed && !session.revealed) {
    return <div className="candc-app" style={profileVars()}><main className="candc-wait"><div className="candc-orbit"/><div className="candc-eyebrow">Your responses are in</div><h1>We’ll show the group responses shortly.</h1><p>You can keep your own judgement in mind. The group pattern stays hidden until everyone has had a chance to answer.</p><span className="candc-countnote">{aggregate?.response_count || 0} responses in</span></main></div>;
  }

  if (committed && session.revealed && guidance) {
    const original = guidance.original;
    const item = guidance.item || diagnosticItem;
    return <div className="candc-app" style={profileVars()}>
      <main className="candc-shell">
        <header className="candc-hero"><div><div className="candc-eyebrow">One case worth another look</div><h1>What might explain the different readings?</h1></div><p>The group disagreed. That does not make the majority correct. It gives you something worth inspecting.</p></header>
        <section className="candc-reflect-grid">
          <div className="candc-prompt-stack">
            <article className="candc-paper"><Context value={item?.optional_context}/><blockquote>{item?.content}</blockquote><small>Your first response: {responseLabels(config, original).join(", ")}</small></article>
            {(guidance.guidance || []).map((block, i) => <div className="candc-question" key={i}>{block.text || block}</div>)}
          </div>
          <div className="candc-resolution">
            <h2>Looking at it again, where are you now?</h2>
            <div className="candc-resolution-options">{guidance.resolution.options.map((option) => <button key={option.id} className={resolutionState === option.id ? "selected" : ""} onClick={() => { setResolutionState(option.id); setRevision(original); }}>{option.label}</button>)}</div>
            {changedOption && <div className="candc-revision"><p>Change the labels for this case only.</p>{config.categories.map((cat, i) => {
              const selected = revision?.category_ids?.includes(cat.id);
              return <button key={cat.id} className={selected ? "selected" : ""} style={{ "--cat": categoryColor(i, CANDC_PROFILE) }} onClick={() => setRevision(toggleCategory(config, revision, cat.id))}>{cat.label}</button>;
            })}{config.classification.explicit_none?.enabled && <button className={revision?.explicit_none ? "selected" : ""} onClick={() => setRevision(chooseExplicitNone(!revision?.explicit_none))}>{config.classification.explicit_none.label}</button>}</div>}
            {error && <p className="candc-error">{error}</p>}
            <button className="candc-primary" disabled={!resolutionState || busy} onClick={finish}>That’s where I am now</button>
          </div>
        </section>
      </main>
    </div>;
  }

  if (committed && session.revealed && aggregate?.revealed) {
    return <div className="candc-app" style={profileVars()}><main className="candc-shell">
      <header className="candc-hero"><div><div className="candc-eyebrow">How did the group respond?</div><h1>Some cases were easier to place than others.</h1></div><p>Look for where people read the same case differently—not simply which label was most common.</p></header>
      <section className="candc-results-grid">{config.items.map((item) => <article className={`candc-result-card ${item.id === diagnosticId ? "focus" : ""}`} key={item.id}><h3>{item.content}</h3><ResultBars config={config} itemId={item.id} aggregate={aggregate}/></article>)}</section>
      <div className="candc-focus-callout"><strong>One case produced the widest spread of readings.</strong><span>{diagnosticItem?.content}</span></div>
      {error && <p className="candc-error">{error}</p>}
      <button className="candc-primary candc-right" disabled={busy} onClick={openGuidance}>Look at it again</button>
    </main></div>;
  }

  return <div className="candc-app" style={profileVars()}><main className="candc-shell">
    <header className="candc-hero"><div><div className="candc-eyebrow">What do you notice?</div><h1>{config.classification.prompt || "How would you sort these cases?"}</h1></div><p>{config.entry.text}</p></header>
    <section className="candc-workbench">
      <nav className="candc-case-list">{config.items.map((item, i) => <button key={item.id} className={`${i === index ? "active" : ""} ${working[item.id] ? "done" : ""}`} onClick={() => setIndex(i)}><i>{i + 1}</i><span>Case {i + 1}</span></button>)}</nav>
      <div className="candc-workspace">
        <article className="candc-paper"><Context value={currentItem.optional_context}/><blockquote>{currentItem.content}</blockquote><small>Start with how you read it.</small></article>
        <h2>What, if anything, fits this case?</h2>
        <div className="candc-tag-grid">{config.categories.map((category, i) => {
          const selected = currentResponse.category_ids.includes(category.id);
          return <button disabled={busy} key={category.id} className={selected ? "selected" : ""} style={{ "--cat": categoryColor(i, CANDC_PROFILE) }} onClick={() => save(toggleCategory(config, currentResponse, category.id))}>{category.label}</button>;
        })}{config.classification.explicit_none?.enabled && <button disabled={busy} className={`candc-none ${currentResponse.explicit_none ? "selected" : ""}`} onClick={() => save(chooseExplicitNone(!currentResponse.explicit_none))}>{config.classification.explicit_none.label}</button>}</div>
        <div className="candc-nav"><button onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0}>Previous</button><span>{done} of {config.items.length} sorted</span><button onClick={() => setIndex((index + 1) % config.items.length)}>Next case</button></div>
      </div>
    </section>
    {error && <p className="candc-error">{error}</p>}
    <footer className="candc-submit"><span>You can change any answer until you finish sorting.</span><button className="candc-primary" disabled={!completeSet(config, working) || busy} onClick={commit}>I’ve sorted these</button></footer>
  </main></div>;
}
