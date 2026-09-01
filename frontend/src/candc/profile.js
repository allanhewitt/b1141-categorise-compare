export const CANDC_PROFILE_ID = "candc_sorting_workbench_v1";

export const CANDC_PROFILE = Object.freeze({
  id: CANDC_PROFILE_ID,
  background: "#111614",
  panel: "#18201d",
  panelRaised: "#202a26",
  paper: "#f2eee4",
  paperInk: "#17201d",
  text: "#f4f6f3",
  muted: "#9eaaa4",
  accent: "#d7ff70",
  accentInk: "#16200f",
  line: "rgba(255,255,255,.12)",
  categoryPalette: ["#f2a65a", "#8bc6c0", "#b8a1e3", "#e38c9c", "#b9c1bd"],
  radius: "22px",
});

export function profileVars(profile = CANDC_PROFILE) {
  return {
    "--candc-bg": profile.background,
    "--candc-panel": profile.panel,
    "--candc-panel-raised": profile.panelRaised,
    "--candc-paper": profile.paper,
    "--candc-paper-ink": profile.paperInk,
    "--candc-text": profile.text,
    "--candc-muted": profile.muted,
    "--candc-accent": profile.accent,
    "--candc-accent-ink": profile.accentInk,
    "--candc-line": profile.line,
    "--candc-radius": profile.radius,
  };
}

export function categoryColor(index, profile = CANDC_PROFILE) {
  return profile.categoryPalette[index % profile.categoryPalette.length];
}
