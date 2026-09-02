const PALETTE = [
  "#2563eb", "#7c3aed", "#db2777", "#dc2626", "#d97706",
  "#059669", "#0891b2", "#4f46e5", "#9333ea", "#be123c",
];

export function userInitial(name?: string | null): string {
  const trimmed = (name ?? "?").trim();
  return trimmed[0]?.toUpperCase() ?? "?";
}

export function userColor(seed?: string | null): string {
  if (!seed) return PALETTE[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function userTextColor(bg: string): string {
  const hex = bg.replace("#", "");
  if (hex.length !== 6) return "#ffffff";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#1e293b" : "#ffffff";
}
