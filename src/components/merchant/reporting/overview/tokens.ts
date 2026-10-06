/**
 * Chart colors. Categorical slots validated with the dataviz palette validator
 * (light surface; lightness band, chroma floor, CVD + normal-vision separation and
 * 3:1 contrast all pass). Slots are assigned by entity, never by rank.
 */
export const SERIES = {
  indigo: "#4F46E5", // brand / single series; Card; New donors
  teal: "#0D9488", // ACH; Returning donors
  amber: "#D97706", // External
  other: "#CBD5E1", // "Other" long tail
} as const;

export const METHOD_COLOR: Record<string, string> = {
  CARD: SERIES.indigo,
  ACH: SERIES.teal,
  EXTERNAL: SERIES.amber,
};

export const METHOD_LABEL: Record<string, string> = {
  CARD: "Card",
  ACH: "Bank (ACH)",
  EXTERNAL: "External",
};
