// src/styles/theme.ts
const theme = {
  colors: {
    bg: "#f8fafc",
    panelBg: "#ffffff",
    text: "#0f172a",
    subtext: "#475569",
    border: "#e5e7eb",
    accent: "#6366f1",
    accentSoft: "#eef2ff",
    muted: "#94a3b8",
    danger: "#b91c1c",
    success: "#059669",
    warn: "#d97706",
  },
  radii: { sm: 6, md: 8, lg: 12 },
  spacing: { xs: 6, sm: 8, md: 12, lg: 16 },
  panel: {
    padding: 12,
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    background: "#ffffff",
  } as React.CSSProperties,
  button: {
    base: {
      padding: "8px 12px",
      borderRadius: 6,
      border: "1px solid #94a3b8",
      background: "#ffffff",
      cursor: "pointer",
    } as React.CSSProperties,
    subtle: {
      padding: "6px 10px",
      borderRadius: 6,
      border: "1px solid #e5e7eb",
      background: "#f8fafc",
      cursor: "pointer",
    } as React.CSSProperties,
  },
  input: {
    base: {
      border: "1px solid #cbd5e1",
      borderRadius: 6,
      padding: "6px 8px",
      background: "#ffffff",
    } as React.CSSProperties,
  },
};

export default theme;
export { theme }; // optional named export
// src/styles/theme.ts
const theme = {
  colors: {
    // base
    bg: "#f8fafc",
    text: "#111827",
    border: "#e5e7eb",
    panelBg: "#ffffff",

    // brand / accents (match old UI)
    brandBlue1: "#1e40af",
    brandBlue2: "#3b82f6",
    brandCyan: "#06b6d4",

    accent: "#3b82f6",
    accentSoft: "rgba(59,130,246,.10)",

    // state chips
    warn: "#d97706",
    error: "#dc2626",
    good: "#10b981",
  },

  // minimal button presets used below
  button: {
    subtle: {
      padding: "10px 14px",
      border: "1px solid #e5e7eb",
      borderRadius: 10,
      background: "#fff",
      cursor: "pointer",
      fontWeight: 600 as const,
    },
  },
};

export default theme;
