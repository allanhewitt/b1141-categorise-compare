import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import CategoryBoxes, { colorForCategory } from "./CategoryBoxes.jsx";

const API = import.meta.env.VITE_API_BASE || "http://localhost:4000";
const TOKEN_TTL_MS = 10 * 60 * 1000;

function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // fall through
    }
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function currentActivityId() {
  const parts = (window.location.hash || "").split("/").filter(Boolean);
  return parts[parts.length - 1] || "unknown-activity";
}

function getToken() {
  const activityId = currentActivityId();
  const storageKey = `gedl:${activityId}:participant`;
  const now = Date.now();
  let stored = null;

  try {
    stored = JSON.parse(localStorage.getItem(storageKey));
  } catch {
    stored = null;
  }

  if (
    stored?.token &&
    Number.isFinite(stored.lastSeen) &&
    now - stored.lastSeen < TOKEN_TTL_MS
  ) {
    localStorage.setItem(storageKey, JSON.stringify({ token: stored.token, lastSeen: now }));
    return stored.token;
  }

  const token = generateId();
  localStorage.setItem(storageKey, JSON.stringify({ token, lastSeen: now }));
  localStorage.removeItem("categorise-token");
  return token;
}

function sameCategories(a = [], b = []) {
  return [...a].sort().join("|") === [...b].sort().join("|");
}

function classificationSummary(config, assignments) {
  return config.items.map((item) => ({ item, cats: assignments[item] || [] }));
}

function Sorter({
  config,
  assignments,
  selectedItem,
  setSelectedItem,
  toggle,
  locked = false,
}) {
  const [dragOverCat, setDragOverCat] = useState(null);
  const [dragOverPool, setDragOverPool] = useState(false);
  const unassigned = config.items.filter((item) => !(assignments[item] || []).length);

  const unassignAll = async (item) => {
    if (locked) return;
    const current = assignments[item] || [];
    for (const cat of current) {
      await toggle(item, cat);
    }
  };

  return (
    <>
      {!locked && (
        <div
          className={`pool${dragOverPool ? " pool-dragover" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverPool(true);
          }}
          onDragLeave={() => setDragOverPool(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOverPool(false);
            const item = e.dataTransfer.getData("text/plain");
            if (item) unassignAll(item);
          }}
        >
          {unassigned.length === 0 ? (
            <span className="muted">All cases classified</span>
          ) : (
            unassigned.map((item) => (
              <button
                key={item}
                type="button"
                draggable={!locked}
                onDragStart={(e) => e.dataTransfer.setData("text/plain", item)}
                className={`chip${selectedItem === item ? " chip-selected" : ""}`}
                onClick={() =>
                  !locked && setSelectedItem((prev) => (prev === item ? null : item))
                }
              >
                {item}
              </button>
            ))
          )}
        </div>
      )}

      <div className="sort-buckets">
        {config.categories.map((cat) => {
          const color = colorForCategory(config.categories, cat);
          const placed = config.items.filter((item) =>
            (assignments[item] || []).includes(cat)
          );
          return (
            <div
              className={`sort-bucket${dragOverCat === cat ? " sort-bucket-dragover" : ""}${
                locked ? " sort-bucket-locked" : ""
              }`}
              key={cat}
              style={dragOverCat === cat ? { borderColor: color } : undefined}
              onClick={() => !locked && selectedItem && toggle(selectedItem, cat)}
              onDragOver={(e) => {
                if (locked) return;
                e.preventDefault();
                setDragOverCat(cat);
              }}
              onDragLeave={() => setDragOverCat((prev) => (prev === cat ? null : prev))}
              onDrop={(e) => {
                if (locked) return;
                e.preventDefault();
                setDragOverCat(null);
                const item = e.dataTransfer.getData("text/plain");
                if (item) toggle(item, cat);
              }}
            >
              <div className="sort-bucket-header">
                <span className="category-dot" style={{ background: color }} />
                <span>{cat}</span>
              </div>
              <div className="sort-bucket-chips">
                {placed.map((item) => (
                  <button
                    key={item}
                    type="button"
                    draggable={!locked}
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", item)}
                    className="chip chip-placed"
                    style={{ background: `${color}22`, color }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!locked) toggle(item, cat);
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export default function Respond() {
  const { id } = useParams();
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  const [respondent, setRespondent] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [aggregate, setAggregate] = useState(null);
  const [predictionDraft, setPredictionDraft] = useState([]);
  const [token] = useState(getToken);

  useEffect(() => {
    fetch(`${API}/api/config/categorise/${id}`)
      .then((r) => {
        if (!r.ok) {
          throw new Error(
            r.status === 404
              ? "This activity does not exist. Check the link you were given."
              : "This activity is not currently active."
          );
        }
        return r.json();
      })
      .then((cfg) => {
        setConfig(cfg);
        return fetch(`${API}/api/response/categorise/${id}/${token}`);
      })
      .then((r) => (r && r.ok ? r.json() : null))
      .then((state) => {
        setRespondent(state);
        setPredictionDraft(state?.prediction || []);
      })
      .catch((e) => setError(e.message));
  }, [id, token]);

  const fetchAggregate = useCallback(() => {
    fetch(`${API}/api/aggregate/categorise/${id}?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then(setAggregate)
      .catch(() => {});
  }, [id, token]);

  useEffect(() => {
    fetchAggregate();
    const interval = setInterval(fetchAggregate, 2000);
    return () => clearInterval(interval);
  }, [fetchAggregate]);

  const toggle = async (item, category) => {
    const res = await fetch(`${API}/api/response/categorise/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, item, category }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "That change could not be saved.");
      return;
    }
    setRespondent(data.respondent);
    setSelectedItem(null);
  };

  const commit = async () => {
    const res = await fetch(`${API}/api/response/categorise/${id}/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Your classification could not be locked.");
      return;
    }
    setError(null);
    setRespondent(data.respondent);
    setPredictionDraft([]);
    fetchAggregate();
  };

  const savePrediction = async () => {
    const res = await fetch(`${API}/api/response/categorise/${id}/prediction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, items: predictionDraft }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Your prediction could not be saved.");
      return;
    }
    setError(null);
    setRespondent(data.respondent);
    fetchAggregate();
  };

  const finalise = async () => {
    const res = await fetch(`${API}/api/response/categorise/${id}/finalise`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Your reconsideration could not be completed.");
      return;
    }
    setError(null);
    setRespondent(data.respondent);
    fetchAggregate();
  };

  if (error && !config) {
    return (
      <div className="wrap">
        <p className="error">{error}</p>
      </div>
    );
  }

  if (!config || !respondent) {
    return (
      <div className="wrap">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const committed = !!respondent.committed;
  const revealed = !!aggregate?.revealed;
  const predictionMade = !!respondent.prediction?.length;
  const workingAssignments = respondent.working || {};
  const currentAssignments =
    revealed && committed
      ? respondent.revised || respondent.committed
      : respondent.committed || workingAssignments;

  const complete = config.items.every((item) => {
    const cats = workingAssignments[item] || [];
    return config.exclusive ? cats.length === 1 : cats.length >= 1;
  });

  const changedItems = committed
    ? config.items.filter(
        (item) =>
          !sameCategories(
            respondent.committed?.[item] || [],
            (respondent.revised || respondent.committed)?.[item] || []
          )
      )
    : [];

  const predictedActualHits = revealed
    ? respondent.prediction.filter((item) => aggregate.mostDivisive.includes(item))
    : [];

  return (
    <div className="wrap wrap-wide">
      <div className="phase-kicker">
        {!committed
          ? "1 · COMMIT"
          : !predictionMade
          ? "2 · ANTICIPATE"
          : !revealed
          ? "3 · WAIT FOR THE REVEAL"
          : respondent.finalised
          ? "5 · TRACE"
          : "4 · CONFRONT & RECONSIDER"}
      </div>

      <h1>{config.prompt}</h1>

      {!committed && (
        <>
          <p className="muted small-top">
            Classify every case using one consistent principle. The class view is hidden
            until you have committed and made a prediction.
          </p>

          {error && <p className="error">{error}</p>}

          <Sorter
            config={config}
            assignments={workingAssignments}
            selectedItem={selectedItem}
            setSelectedItem={setSelectedItem}
            toggle={toggle}
          />

          <div className="action-panel">
            <p>
              {complete
                ? "You have classified every case. Lock this as your initial judgement."
                : "Classify every case before you can lock your judgement."}
            </p>
            <button className="primary-action" disabled={!complete} onClick={commit}>
              Lock my classification
            </button>
          </div>
        </>
      )}

      {committed && !predictionMade && !revealed && (
        <>
          <div className="locked-panel">
            <strong>Your classification is locked.</strong>
            <p>Before seeing the room, predict where disagreement will be greatest.</p>
          </div>

          <h2>Which one or two cases will divide the class most?</h2>
          <div className="prediction-grid">
            {config.items.map((item) => {
              const selected = predictionDraft.includes(item);
              return (
                <button
                  key={item}
                  className={`prediction-card${selected ? " prediction-card-selected" : ""}`}
                  onClick={() =>
                    setPredictionDraft((prev) => {
                      if (prev.includes(item)) return prev.filter((x) => x !== item);
                      if (prev.length >= 2) return prev;
                      return [...prev, item];
                    })
                  }
                >
                  {item}
                </button>
              );
            })}
          </div>
          <p className="muted">
            Choose up to two. This prediction is made before the class distribution is
            available.
          </p>
          {error && <p className="error">{error}</p>}
          <button
            className="primary-action"
            disabled={predictionDraft.length < 1}
            onClick={savePrediction}
          >
            Lock my prediction
          </button>
        </>
      )}

      {committed && predictionMade && !revealed && (
        <>
          <div className="waiting-panel">
            <div className="waiting-dot" />
            <div>
              <strong>Prediction locked.</strong>
              <p>
                You picked: {respondent.prediction.join(" · ")}. The class view is still
                hidden.
              </p>
            </div>
          </div>
          <div className="locked-summary">
            {classificationSummary(config, respondent.committed).map(({ item, cats }) => (
              <div className="summary-row" key={item}>
                <span>{item}</span>
                <strong>{cats.join(", ")}</strong>
              </div>
            ))}
          </div>
        </>
      )}

      {committed && revealed && (
        <>
          <div className="reveal-panel">
            <div className="reveal-label">THE REVEAL</div>
            <h2>Where did the room actually split?</h2>
            <p>
              You predicted: <strong>{respondent.prediction.join(" · ")}</strong>
            </p>
            <p>
              The strongest class divergence was around:{" "}
              <strong>{aggregate.mostDivisive.join(" · ") || "not enough responses yet"}</strong>
            </p>
            {predictedActualHits.length > 0 ? (
              <p className="reveal-hit">
                Your prediction overlapped with the most divided case
                {predictedActualHits.length > 1 ? "s" : ""}.
              </p>
            ) : (
              <p className="muted">
                Your model of the room differed from where disagreement actually appeared.
              </p>
            )}
          </div>

          <CategoryBoxes
            items={aggregate.items}
            categories={aggregate.categories}
            counts={aggregate.counts}
          />

          {!respondent.finalised ? (
            <>
              <div className="reconsider-panel">
                <h2>Now reconsider your own classification</h2>
                <p>
                  Seeing disagreement is not a reason to copy the majority. Change a case
                  only if the comparison has genuinely altered how you are thinking about it.
                </p>
              </div>

              {error && <p className="error">{error}</p>}

              <Sorter
                config={config}
                assignments={currentAssignments}
                selectedItem={selectedItem}
                setSelectedItem={setSelectedItem}
                toggle={toggle}
              />

              <div className="trace-preview">
                <strong>
                  {changedItems.length === 0
                    ? "So far, you are holding your original classification."
                    : `${changedItems.length} case${
                        changedItems.length === 1 ? "" : "s"
                      } changed from your initial judgement.`}
                </strong>
                {changedItems.map((item) => (
                  <div className="trace-change" key={item}>
                    <span>{item}</span>
                    <span>
                      {respondent.committed[item].join(", ")} →{" "}
                      {(respondent.revised || respondent.committed)[item].join(", ")}
                    </span>
                  </div>
                ))}
              </div>

              <button className="primary-action" onClick={finalise}>
                Finish reconsideration
              </button>
            </>
          ) : (
            <div className="completion-panel">
              <h2>Your reasoning trace</h2>
              {changedItems.length === 0 ? (
                <p>
                  You saw the class distribution and kept your original classification.
                  Holding a view after confrontation is a legitimate outcome.
                </p>
              ) : (
                <>
                  <p>
                    You changed {changedItems.length} case
                    {changedItems.length === 1 ? "" : "s"} after the reveal:
                  </p>
                  {changedItems.map((item) => (
                    <div className="trace-change" key={item}>
                      <span>{item}</span>
                      <strong>
                        {respondent.committed[item].join(", ")} →{" "}
                        {respondent.revised[item].join(", ")}
                      </strong>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
