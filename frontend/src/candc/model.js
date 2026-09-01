export function emptyItemResponse() {
  return { category_ids: [], explicit_none: false };
}

export function responseFor(working = {}, itemId) {
  const value = working[itemId];
  return value ? { category_ids: [...(value.category_ids || [])], explicit_none: Boolean(value.explicit_none) } : emptyItemResponse();
}

export function itemComplete(config, response) {
  if (!response) return false;
  if (response.explicit_none) return Boolean(config.classification.explicit_none?.enabled);
  if (config.classification.mode === "exclusive") return response.category_ids?.length === 1;
  return (response.category_ids?.length || 0) >= 1;
}

export function completeCount(config, working = {}) {
  return config.items.filter((item) => itemComplete(config, working[item.id])).length;
}

export function completeSet(config, working = {}) {
  return completeCount(config, working) === config.items.length;
}

export function toggleCategory(config, current, categoryId) {
  const response = responseFor({ item: current }, "item");
  if (config.classification.mode === "exclusive") {
    return { category_ids: [categoryId], explicit_none: false };
  }
  const ids = new Set(response.category_ids);
  if (ids.has(categoryId)) ids.delete(categoryId); else ids.add(categoryId);
  return { category_ids: [...ids], explicit_none: false };
}

export function chooseExplicitNone(enabled) {
  return { category_ids: [], explicit_none: Boolean(enabled) };
}

export function stateLabels(config) {
  const labels = Object.fromEntries(config.categories.map((category) => [category.id, category.label]));
  if (config.classification.explicit_none?.enabled) {
    labels[config.classification.explicit_none.id] = config.classification.explicit_none.label;
  }
  return labels;
}

export function responseLabels(config, response) {
  const labels = stateLabels(config);
  if (response?.explicit_none) return [config.classification.explicit_none.label];
  return (response?.category_ids || []).map((id) => labels[id] || id);
}

export function percent(count, total) {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}
