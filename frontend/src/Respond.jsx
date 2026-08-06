import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import CategoryBoxes, { colorForCategory } from "./CategoryBoxes.jsx";

const API = import.meta.env.VITE_API_BASE || "http://localhost:4000";

// crypto.randomUUID() requires a secure context (HTTPS/localhost) — falls
// back to a manual generator so this works on a plain http://*.sslip.io
// deployment too (lesson from b1141-likert-poll).
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

function getToken() {
  let token = localStorage.getItem("categorise-token");
  if (!token) {
    token = generateId();
    localStorage.setItem("categorise-token", token);
  }
  return token;
}

export default function Respond() {
  const { id } = useParams();
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  const [assignments, setAssignments] = useState({}); // item -> [categories]
  const [selectedItem, setSelectedItem] = useState(null);
  const [aggregate, setAggregate] = useState(null);
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
      .then((r) => (r && r.ok ? r.json() : {}))
      .then(setAssignments)
      .catch((e) => setError(e.message));
  }, [id, token]);

  const fetchAggregate = useCallback(() => {
    fetch(`${API}/api/aggregate/categorise/${id}`)
      .then((r) => r.json())
      .then(setAggregate)
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    fetchAggregate();
    const interval = setInterval(fetchAggregate, 4000);
    return () => clearInterval(interval);
  }, [fetchAggregate]);

  const toggle = async (item, category) => {
    const res = await fetch(`${API}/api/response/categorise/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, item, category }),
    });
    if (res.ok) {
      const data = await res.json();
      setAssignments((prev) => ({ ...prev, [item]: data.current }));
    }
    setSelectedItem(null);
  };

  // Dragging a placed chip back onto the pool removes it from every
  // category it's currently in (relevant mainly for non-exclusive
  // activities, where an item can hold more than one category).
  const unassignAll = async (item) => {
    const current = assignments[item] || [];
    await Promise.all(current.map((cat) => toggle(item, cat)));
  };

  const [dragOverCat, setDragOverCat] = useState(null);
  const [dragOverPool, setDragOverPool] = useState(false);

  if (error) {
    return (
      <div className="wrap">
        <p className="error">{error}</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="wrap">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const unassigned = config.items.filter((item) => !(assignments[item] || []).length);

  return (
    <div className="wrap wrap-wide">
      <h1>{config.prompt}</h1>
      <p className="muted small-top">
        {config.exclusive
          ? "Drag a term into a category, or tap it then tap the category it fits."
          : "Drag a term into every category it fits, or tap it then tap each category — a term can carry more than one."}
      </p>

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
          <span className="muted">All sorted</span>
        ) : (
          unassigned.map((item) => (
            <button
              key={item}
              type="button"
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/plain", item)}
              className={`chip${selectedItem === item ? " chip-selected" : ""}`}
              onClick={() => setSelectedItem((prev) => (prev === item ? null : item))}
            >
              {item}
            </button>
          ))
        )}
      </div>

      <div className="sort-buckets">
        {config.categories.map((cat) => {
          const color = colorForCategory(config.categories, cat);
          const placed = config.items.filter((item) => (assignments[item] || []).includes(cat));
          return (
            <div
              className={`sort-bucket${dragOverCat === cat ? " sort-bucket-dragover" : ""}`}
              key={cat}
              style={dragOverCat === cat ? { borderColor: color } : undefined}
              onClick={() => selectedItem && toggle(selectedItem, cat)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverCat(cat);
              }}
              onDragLeave={() => setDragOverCat((prev) => (prev === cat ? null : prev))}
              onDrop={(e) => {
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
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", item)}
                    className="chip chip-placed"
                    style={{ background: `${color}22`, color }}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(item, cat);
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

      {aggregate?.revealed && (
        <div className="confirmation">
          <p className="muted small-top">How the class has sorted these so far:</p>
          <CategoryBoxes
            items={aggregate.items}
            categories={aggregate.categories}
            counts={aggregate.counts}
          />
        </div>
      )}
    </div>
  );
}
