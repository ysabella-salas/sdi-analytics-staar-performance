// Minimal i18n surface for the kit. Strings ship in EN and ES; the active
// locale follows the Power BI host locale (host.locale -> "es" or "en-US"…),
// defaulting to English. UI strings stay OUT of recipe code so a translator
// can replace them without touching render logic.

const TABLES = {
  en: {
    skipToTable:       "View as table",
    renderFailed:      "Chart could not be drawn.",
    tableStillVisible: "The data table below is still available.",
    noData:            "No data available.",
    series:            "Series",
    value:             "Value",
    target:            "Target",
    delta:             "Change",
  },
  es: {
    skipToTable:       "Ver como tabla",
    renderFailed:      "No se pudo dibujar el gráfico.",
    tableStillVisible: "La tabla de datos abajo sigue disponible.",
    noData:            "Sin datos disponibles.",
    series:            "Serie",
    value:             "Valor",
    target:            "Objetivo",
    delta:             "Cambio",
  },
} as const;

function pickLocale(): "en" | "es" {
  // Power BI exposes the user's locale on the visual host; consumers wire
  // their host into this in the visual constructor. Default to English.
  const candidate = (globalThis as any)?.HISD_LOCALE
    ?? (typeof navigator !== "undefined" ? navigator.language : "en");
  return String(candidate).toLowerCase().startsWith("es") ? "es" : "en";
}

export function strings(key: keyof typeof TABLES["en"]): string {
  return TABLES[pickLocale()][key];
}
