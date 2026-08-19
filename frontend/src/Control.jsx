import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import CategoryBoxes from "./CategoryBoxes.jsx";

const API = import.meta.env.VITE_API_BASE || "http://localhost:4000";

export default function Control() {
  const { id } = useParams();
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  const [aggregate, setAggregate] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/config/categorise/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("This activity does not exist.");
        return r.json();
      })
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, [id]);

  const fetchAggregate = useCallback(() => {
    fetch(`${API}/api/aggregate/categorise/${id}`)
      .then((r) => r.json())
      .then(setAggregate)
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    fetchAggregate();
    const interval = setInterval(fetchAggregate, 2000);
    return () => clearInterval(interval);
  }, [fetchAggregate]);

  const reveal = () =>
    fetch(`${API}/api/session/${id}/reveal`, { method: "POST" }).then(fetchAggregate);

  const clear = () => {
    if (!window.confirm("Clear all responses for this activity's live view?")) return;
    fetch(`${API}/api/session/${id}/clear`, { method: "POST" }).then(fetchAggregate);
  };

  if (error) {
    return (
      <div className="wrap">
        <p className="error">{error}</p>
      </div>
    );
  }

  if (!config || !aggregate) {
    return (
      <div className="wrap">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const predicted = [...config.items].sort(
    (a, b) => (aggregate.predictionCounts?.[b] || 0) - (aggregate.predictionCounts?.[a] || 0)
  );

  return (
    <div className="wrap wrap-wide">
      <div className="phase-kicker">LECTURER CONTROL · COMMIT → ANTICIPATE → REVEAL</div>
      <h1>{config.prompt}</h1>
      <p className="muted">
        {aggregate.total} student{aggregate.total === 1 ? "" : "s"} have locked a complete
        classification{config.cohort_size ? ` (of ~${config.cohort_size})` : ""}.
      </p>

      <div className="control-grid">
        <div className="control-card">
          <span className="control-label">Committed</span>
          <strong>{aggregate.total}</strong>
          <small>Complete initial classifications</small>
        </div>
        <div className="control-card">
          <span className="control-label">Reconsidered</span>
          <strong>{aggregate.reconsideredCount || 0}</strong>
          <small>Students who have completed the post-reveal trace</small>
        </div>
      </div>

      <div className="prediction-control">
        <h2>Before the reveal: where students expect disagreement</h2>
        <p className="muted">
          These are predictions about the room, not their actual classifications. They can
          be discussed without giving away the cohort result.
        </p>
        <div className="prediction-bars">
          {predicted.map((item) => {
            const count = aggregate.predictionCounts?.[item] || 0;
            const pct = aggregate.total ? Math.round((count / aggregate.total) * 100) : 0;
            return (
              <div className="prediction-bar-row" key={item}>
                <div className="prediction-bar-label">
                  <span>{item}</span>
                  <strong>{count}</strong>
                </div>
                <div className="prediction-bar-track">
                  <div className="prediction-bar-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="controls">
        <button onClick={reveal} disabled={aggregate.revealed}>
          {aggregate.revealed ? "Class view revealed" : "Reveal class divergence"}
        </button>
        <button className="danger" onClick={clear}>
          Clear session
        </button>
      </div>

      <div className={`lecturer-reveal${aggregate.revealed ? " lecturer-reveal-live" : ""}`}>
        <div className="reveal-label">
          {aggregate.revealed ? "NOW VISIBLE TO ELIGIBLE STUDENTS" : "HIDDEN FROM STUDENTS"}
        </div>
        <h2>Actual class classification</h2>
        <p>
          Most divided: <strong>{aggregate.mostDivisive.join(" · ") || "not enough responses yet"}</strong>
        </p>
        <CategoryBoxes
          items={aggregate.items}
          categories={aggregate.categories}
          counts={aggregate.counts}
        />
      </div>
    </div>
  );
}
