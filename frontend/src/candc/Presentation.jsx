import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { candcApi } from "./api.js";
import { CANDC_PROFILE, categoryColor, profileVars } from "./profile.js";
import { percent, stateLabels } from "./model.js";

function Bars({ config, itemId, aggregate, large = false }) {
  const labels = stateLabels(config);
  const ids = config.categories.map((category) => category.id);
  if (config.classification.explicit_none?.enabled) ids.push(config.classification.explicit_none.id);
  const total = aggregate.participant_count || aggregate.response_count || 0;
  return <div className={large ? "candc-bars candc-bars-large" : "candc-bars"}>{ids.map((id, index) => {
    const n = aggregate.counts?.[itemId]?.[id] || 0;
    return <div className="candc-bar-row" key={id}><span>{labels[id]}</span><div className="candc-bar"><i style={{ width: `${percent(n, total)}%`, background: categoryColor(index, CANDC_PROFILE) }}/></div><b>{percent(n, total)}%</b></div>;
  })}</div>;
}

export default function CandCPresentation() {
  const { id } = useParams();
  const [activity, setActivity] = useState(null);
  const [session, setSession] = useState(null);
  const [aggregate, setAggregate] = useState(null);
  const [error, setError] = useState("");
  const [focus, setFocus] = useState(false);
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

  if (!activity || !config || !session || !aggregate) return <div className="candc-app candc-presentation" style={profileVars()}><main className="candc-projector-wait"><p>{error || "Loading…"}</p></main></div>;

  const diagnostic = config.items.find((item) => item.id === aggregate.diagnostic_item_id);

  if (!session.revealed || !aggregate.revealed) {
    return <div className="candc-app candc-presentation" style={profileVars()}><main className="candc-projector-collect"><div className="candc-eyebrow">What do you notice?</div><h1>{config.classification.prompt || "Read each case and decide where it fits."}</h1><div className="candc-projector-count">{aggregate.response_count || 0}</div><p>responses in</p></main></div>;
  }

  if (focus && diagnostic) {
    return <div className="candc-app candc-presentation" style={profileVars()}><main className="candc-projector-focus"><div className="candc-eyebrow">One case worth another look</div><section><article className="candc-paper"><div className="candc-context">{Object.values(diagnostic.optional_context || {}).filter(Boolean).map((value) => <span key={value}>{value}</span>)}</div><blockquote>{diagnostic.content}</blockquote></article><Bars config={config} itemId={diagnostic.id} aggregate={aggregate} large/></section><button className="candc-projector-toggle" onClick={() => setFocus(false)}>Show all cases</button></main></div>;
  }

  return <div className="candc-app candc-presentation" style={profileVars()}><main className="candc-projector-results"><div className="candc-eyebrow">How did the group respond?</div><h1>Some cases were easier to place than others.</h1><div className="candc-projector-grid">{config.items.map((item) => <article key={item.id} className={item.id === aggregate.diagnostic_item_id ? "focus" : ""}><h2>{item.content}</h2><Bars config={config} itemId={item.id} aggregate={aggregate}/></article>)}</div>{diagnostic && <button className="candc-projector-toggle" onClick={() => setFocus(true)}>Look again at the case with the widest spread</button>}</main></div>;
}
