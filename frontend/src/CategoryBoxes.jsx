const PALETTE = [
  "#1baf7a", // green
  "#eda100", // amber
  "#e34948", // red
  "#4a3aa7", // violet
  "#898781", // gray
  "#2a78d6", // blue
  "#eb6834", // orange
  "#e87ba4", // magenta
];

export function colorForCategory(categories, category) {
  const idx = categories.indexOf(category);
  return PALETTE[idx % PALETTE.length];
}

export default function CategoryBoxes({ items, categories, counts }) {
  const allCounts = categories.flatMap((cat) => items.map((item) => counts[cat]?.[item] || 0));
  const max = Math.max(1, ...allCounts);

  return (
    <div className="category-boxes">
      {categories.map((cat) => {
        const color = colorForCategory(categories, cat);
        const entries = items
          .map((item) => ({ item, count: counts[cat]?.[item] || 0 }))
          .filter((e) => e.count > 0)
          .sort((a, b) => b.count - a.count);

        return (
          <div className="category-box" key={cat}>
            <div className="category-box-header">
              <span className="category-dot" style={{ background: color }} />
              <span>{cat}</span>
            </div>
            {entries.length === 0 ? (
              <p className="muted small">No responses yet</p>
            ) : (
              entries.map(({ item, count }) => (
                <div className="category-entry" key={item}>
                  <div className="category-entry-line">
                    <span>{item}</span>
                    <span className="muted">{count}</span>
                  </div>
                  <div className="category-entry-track">
                    <div
                      className="category-entry-fill"
                      style={{ width: `${(count / max) * 100}%`, background: color }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}
