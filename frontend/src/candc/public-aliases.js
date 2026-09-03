export const CANDC_PUBLIC_ALIASES = Object.freeze({
  cc01: "b1141-w1-language-and-assumptions-candc",
  cc02: "b1141-w2-us-them",
  cc03: "b1141-w2-does-this-change-the-system",
  cc04: "b1141-w3-political-or-non-political-candc",
  cc05: "b1141-w4-design-an-inclusive-sport",
  cc06: "b1141-w8-four-technological-interventions",
  cc07: "b1141-w9-the-comparison",
});

export function resolveCandCPublicId(id) {
  const key = String(id || "").toLowerCase();
  return CANDC_PUBLIC_ALIASES[key] || id;
}
