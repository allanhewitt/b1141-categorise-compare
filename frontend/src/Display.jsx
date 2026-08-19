import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { colorForCategory } from "./CategoryBoxes.jsx";

const API = import.meta.env.VITE_API_BASE || "http://localhost:4000";

function FullscreenButton() {
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      // Fullscreen can be blocked unless triggered directly by a user gesture.
    }
  };

  return (
    <button
      onClick={toggleFullscreen}
      style={{
        position: "fixed",
        top: 18,
        right: 20,
        zIndex: 10,
        border: "1px solid #cbd6e2",
        background: "rgba(255,255,255,0.94)",
        color: "#102f55",
        borderRadius: 999,
        padding: "9px 15px",
        fontWeight: 700,
        fontSize: 14,
        cursor: "pointer",
        boxShadow: "0 4px 16px rgba(16,47,85,0.10)",
      }}
    >
      ⛶ Full screen
    </button>
  );
}

function CollectionView({ config, aggregate }) {
  const total = aggregate?.total ?? 0;
  const max = config.cohort_size || 0;
  const pct = max ? Math.min(100, (total / max) * 100) : 0;

  return (
    <main style={stageStyle(true)}>
      <FullscreenButton />
      <div style={kickerStyle}>B1141 · Week {config.week} · Classify & predict</div>
      <h1 style={questionStyle}>{config.prompt}</h1>
      <p style={subtitleStyle}>
        Make your own classification first. Then predict which cases you think will divide the room most.
      </p>

      <div style={counterStyle}>
        <strong style={{ fontSize: "clamp(54px, 8vw, 96px)", lineHeight: 1 }}>{total}</strong>
        <span style={{ fontSize: "clamp(18px, 2.2vw, 28px)", fontWeight: 650 }}>
          classifications locked{max ? ` · about ${max} expected` : ""}
        </span>
      </div>

      {max > 0 && (
        <div style={{ width: "min(760px, 76vw)", height: 14, background: "#e6edf4", borderRadius: 999, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,#1f5f99,#102f55)", transition: "width .25s ease" }} />
        </div>
      )}

      <div style={holdStyle}>Class results are hidden until the reveal.</div>
    </main>
  );
}

function DistributionBar({ config, counts, item, total }) {
  const values = config.categories.map((cat) => ({
    cat,
    count: counts?.[cat]?.[item] || 0,
    color: colorForCategory(config.categories, cat),
  }));
  const sum = values.reduce((acc, entry) => acc + entry.count, 0) || total || 1;

  return (
    <div>
      <div style={{ display: "flex", height: 23, borderRadius: 999, overflow: "hidden", background: "#edf1f5", boxShadow: "inset 0 0 0 1px #dbe3eb" }}>
        {values.map((entry) => {
          const width = (entry.count / sum) * 100;
          if (width <= 0) return null;
          return <div key={entry.cat} title={`${entry.cat}: ${entry.count}`} style={{ width: `${width}%`, background: entry.color, transition: "width .3s ease" }} />;
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 9 }}>
        {values.map((entry) => (
          <span key={entry.cat} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: "#46596c", fontWeight: 650 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: entry.color }} />
            {entry.cat} {entry.count}
          </span>
        ))}
      </div>
    </div>
  );
}

function RevealView({ config, aggregate }) {
  const rows = useMemo(() => {
    return config.items
      .map((item) => ({
        item,
        divergence: aggregate?.divergence?.[item] || 0,
        predicted: aggregate?.predictionCounts?.[item] || 0,
      }))
      .sort((a, b) => b.divergence - a.divergence);
  }, [config.items, aggregate]);

  const top = new Set(aggregate?.mostDivisive || []);

  return (
    <main style={stageStyle(false)}>
      <FullscreenButton />
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 26, marginBottom: 22 }}>
        <div>
          <div style={kickerStyle}>B1141 · Week {config.week} · Cohort reveal</div>
          <h1 style={{ margin: "5px 0 8px", color: "#102f55", fontSize: "clamp(30px,3.1vw,48px)", lineHeight: 1.08, maxWidth: 980 }}>
            Where did the class actually divide?
          </h1>
          <p style={{ margin: 0, color: "#5d6d7e", fontSize: "clamp(16px,1.5vw,22px)", lineHeight: 1.4 }}>
            Compare our prediction of disagreement with the classification split we actually produced.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end", paddingRight: 128 }}>
          <div style={chipStyle}><strong>{aggregate.total}</strong><span>locked</span></div>
          <div style={chipStyle}><strong>{aggregate.reconsideredCount || 0}</strong><span>reconsidered</span></div>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))", gap: 15 }}>
        {rows.map((row, index) => (
          <article
            key={row.item}
            style={{
              background: "#fff",
              border: top.has(row.item) ? "2px solid #b67818" : "1px solid #dbe3eb",
              borderRadius: 16,
              padding: "17px 19px 16px",
              boxShadow: top.has(row.item) ? "0 8px 24px rgba(182,120,24,.14)" : "0 5px 18px rgba(16,47,85,.06)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 13 }}>
              <div>
                <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 800, color: top.has(row.item) ? "#b67818" : "#6a7b8c", marginBottom: 5 }}>
                  {top.has(row.item) ? `Most divisive · #${index + 1}` : `Case #${index + 1}`}
                </div>
                <div style={{ fontSize: "clamp(16px,1.45vw,21px)", lineHeight: 1.32, fontWeight: 720, color: "#17202a" }}>{row.item}</div>
              </div>
              <div style={{ minWidth: 95, textAlign: "right" }}>
                <div style={{ fontSize: 28, fontWeight: 850, lineHeight: 1, color: top.has(row.item) ? "#b67818" : "#102f55" }}>
                  {Math.round(row.divergence * 100)}%
                </div>
                <div style={{ fontSize: 11.5, color: "#6a7b8c", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>divergence</div>
              </div>
            </div>

            <DistributionBar config={config} counts={aggregate.counts} item={row.item} total={aggregate.total} />

            <div style={{ marginTop: 12, paddingTop: 11, borderTop: "1px solid #edf1f5", display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
              <span style={{ color: "#5d6d7e" }}>Predicted as divisive by</span>
              <strong style={{ color: "#102f55" }}>{row.predicted} student{row.predicted === 1 ? "" : "s"}</strong>
            </div>
          </article>
        ))}
      </div>

      <div style={{ marginTop: 20, padding: "15px 20px", borderRadius: 13, background: "#eef6ff", border: "1px solid #cfe0f2", color: "#102f55", fontSize: "clamp(17px,1.6vw,23px)", fontWeight: 680, textAlign: "center" }}>
        Which cases challenge the principle you used — and would you classify any of them differently now?
      </div>
    </main>
  );
}

const stageStyle = (centred) => ({
  minHeight: "100vh",
  padding: centred ? "7vh 5vw" : "38px 34px 30px",
  background: "radial-gradient(circle at top right, rgba(31,95,153,.10), transparent 34%), linear-gradient(180deg,#fff 0%,#f5f8fc 100%)",
  color: "#17202a",
  fontFamily: '"Aptos","Segoe UI",system-ui,sans-serif',
  display: centred ? "flex" : "block",
  flexDirection: centred ? "column" : undefined,
  justifyContent: centred ? "center" : undefined,
  alignItems: centred ? "center" : undefined,
  textAlign: centred ? "center" : undefined,
});

const kickerStyle = { fontSize: 14, fontWeight: 850, letterSpacing: ".11em", textTransform: "uppercase", color: "#1f5f99" };
const questionStyle = { color: "#102f55", fontSize: "clamp(34px,4.2vw,62px)", lineHeight: 1.1, maxWidth: 1080, margin: "12px 0 14px" };
const subtitleStyle = { maxWidth: 900, margin: "0 0 34px", color: "#5d6d7e", fontSize: "clamp(19px,2vw,28px)", lineHeight: 1.45 };
const counterStyle = { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: "#102f55", marginBottom: 22 };
const holdStyle = { marginTop: 28, padding: "13px 22px", borderRadius: 999, background: "#eef3f8", color: "#52677a", fontSize: "clamp(16px,1.4vw,21px)", fontWeight: 700 };
const chipStyle = { minWidth: 106, borderRadius: 12, background: "#eef6ff", border: "1px solid #cfe0f2", padding: "9px 13px", display: "flex", flexDirection: "column", alignItems: "center", color: "#102f55" };

export default function Display() {
  const { id } = useParams();
  const [config, setConfig] = useState(null);
  const [aggregate, setAggregate] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/config/categorise/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("This activity does not exist.");
        return r.json();
      })
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, [id]);

  const refresh = useCallback(() => {
    fetch(`${API}/api/aggregate/categorise/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setAggregate(data))
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [refresh]);

  if (error) return <main style={stageStyle(true)}><p style={{ color: "#8f2d2d", fontSize: 22 }}>{error}</p></main>;
  if (!config || !aggregate) return <main style={stageStyle(true)}><div style={kickerStyle}>B1141</div><h1 style={questionStyle}>Loading class display…</h1></main>;

  return aggregate.revealed
    ? <RevealView config={config} aggregate={aggregate} />
    : <CollectionView config={config} aggregate={aggregate} />;
}
