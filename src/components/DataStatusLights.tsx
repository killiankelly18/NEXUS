// Nexus — Navbar Data Status Lights
// Drop-in component to show green "lights" when datasets are loaded.
// - Embeddings: green when state.embeddingsCsv.length > 0
// - Keywords (Queries): green when state.queriesCsv.length > 0
// - Optional: Authority (toggle via prop)
//
// Usage in your Navbar component:
//   import DataStatusLights from "./DataStatusLights";
//   ...
//   <nav> ... <DataStatusLights showAuthority /> </nav>
//
// This module attempts to import your real useWorkspace hook; if unavailable,
// it falls back to a harmless shim so previews don't crash.

import React from "react";

// try to use your real workspace hook; fall back to shim if not present
let useWorkspace: () => {
  state: {
    queriesCsv: any[];
    embeddingsCsv: any[];
    authorityCsv: any[];
  };
};
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ws = require("../context/WorkspaceContext");
  if (ws?.useWorkspace) useWorkspace = ws.useWorkspace;
} catch {}
if (!useWorkspace) {
  useWorkspace = () => ({ state: { queriesCsv: [], embeddingsCsv: [], authorityCsv: [] } });
}

// Small round LED dot
function Led({ on, label }: { on: boolean; label: string }) {
  const color = on ? "#10b981" : "#9ca3af"; // green vs gray
  const glow = on ? "0 0 0 2px rgba(16,185,129,0.2), 0 0 8px rgba(16,185,129,0.6)" : "none";
  return (
    <div
      role="status"
      aria-live="polite"
      title={`${label}: ${on ? "Ready" : "Not loaded"}`}
      style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
    >
      <span
        aria-hidden
        style={{
          width: 10,
          height: 10,
          borderRadius: 999,
          background: color,
          boxShadow: glow,
          border: `1px solid ${on ? "#059669" : "#d1d5db"}`,
          transition: "all 150ms ease",
        }}
      />
      <span style={{ fontSize: 12, color: "#374151" }}>{label}</span>
    </div>
  );
}

/**
 * Compact status group suitable for a navbar's right side.
 * Props:
 *  - showAuthority?: boolean (default false)
 *  - style?: React.CSSProperties (container override)
 */
export default function DataStatusLights({ showAuthority = false, style }: { showAuthority?: boolean; style?: React.CSSProperties }) {
  const { state } = useWorkspace();
  const embeddingsOn = (state.embeddingsCsv?.length ?? 0) > 0;
  const queriesOn = (state.queriesCsv?.length ?? 0) > 0;
  const authorityOn = (state.authorityCsv?.length ?? 0) > 0;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 14,
        padding: "6px 10px",
        background: "#f9fafb",
        border: "1px solid #e5e7eb",
        borderRadius: 999,
        ...style,
      }}
    >
      <Led on={embeddingsOn} label="Embeddings" />
      <div style={{ width: 1, height: 14, background: "#e5e7eb" }} />
      <Led on={queriesOn} label="Keywords" />
      {showAuthority && (
        <>
          <div style={{ width: 1, height: 14, background: "#e5e7eb" }} />
          <Led on={authorityOn} label="Authority" />
        </>
      )}
    </div>
  );
}

/* ----------------- Example integration -----------------

// src/components/Navbar.tsx
import React from "react";
import DataStatusLights from "./DataStatusLights";

export default function Navbar() {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 16px",
        background: "white",
        borderBottom: "1px solid #e5e7eb",
        position: "sticky",
        top: 0,
        zIndex: 40,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <strong style={{ fontSize: 14 }}>NEXUS</strong>
      </div>

      <nav style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* ...your existing nav links/buttons... */}
        <DataStatusLights showAuthority />
      </nav>
    </header>
  );
}

*/
