// HISD design tokens used by every visual in this kit. Re-exported as TypeScript
// constants so the visual still renders correctly when the consuming Power BI
// instance has NOT installed the HISD theme (defensive baseline).
//
// When the theme IS applied, prefer host.colorPalette.getColor() over these
// constants so the user can override via Power BI's theme system.

export const HISD_PALETTE = {
  // Categorical sequence — color-blind-safe, teal-led; mirrors DATAVIZ in
  // scripts/build_tokens.py. Series N % palette.length when there are more
  // than 7 series (and you should ask whether 8+ series is really the chart).
  categorical: [
    "#00A3AF", // teal       — primary
    "#5B3FA0", // purple
    "#006F5B", // dark-green
    "#0E62BD", // blue
    "#F9D04E", // yellow     — NEVER a line/text color on white (carries a dark border in practice)
    "#B72D2D", // red
    "#6DB83D", // light-green
  ],

  // Sequential — single-hue magnitude (low → high)
  sequentialTeal: ["#E0F4F6", "#9CDCE0", "#4ABDC5", "#00A3AF", "#037882", "#024F56", "#022A2F"],

  // Diverging — bipolar around a neutral midpoint
  diverging: {
    negative: ["#B72D2D", "#E27474", "#F2C7C7"], // red → near-neutral
    midpoint: "#F2F0EC",
    positive: ["#C8E2C9", "#6DB83D", "#006F5B"], // → green
  },

  // Semantic chart roles
  positive: "#006F5B",
  atRisk:   "#B45309", // amber (the brand "Sunrise" yellow is reserved)
  negative: "#B72D2D",
  neutral:  "#5B6B72",

  // Surfaces (light theme)
  bg:            "#FFFFFF",
  surfaceMuted:  "#F5F5F5",
  text:          "#19282C",
  textMuted:     "#5B6B72",
  border:        "#D0D6D8",

  // System-color fallbacks for forced-colors
  systemColors: {
    canvas:     "Canvas",
    canvasText: "CanvasText",
    highlight:  "Highlight",
    grayText:   "GrayText",
  },
} as const;
