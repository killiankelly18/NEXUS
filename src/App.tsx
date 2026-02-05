// src/App.tsx
console.debug("APP_BUILD_TAG v12");
declare const require: any;

import React, { useState, Suspense } from "react";
import { WorkspaceProvider } from "./context/WorkspaceContext";

// ---- Tabs (default exports) ----
import WorkspaceTab from "./tabs/WorkspaceTab";
import QueryGeneratorTab from "./tabs/QueryGeneratorTab";
import CoverageTab from "./tabs/CoverageTab";
import OptimisingForAIModeTab from "./tabs/OptimisingForAIModeTab";
import PassageLabTab from "./tabs/PassageLabTab";
import TestingTab from "./tabs/CreateTest";
import ExpertiseTab from "./tabs/ExpertiseTab";
import TopicHubBuilderTab from "./tabs/TopicHubBuilderTab";
import ClusterComparisonTab from "./tabs/ClusterComparisonTab"; //

import {
  Search,
  Target,
  Activity,
  Cpu,
  LinkIcon,
  Network,
  Shield,
  Sparkles,
  Brain,
} from "./components/icons";
import { ArrowRightLeft } from "lucide-react";

// ---- Optional tabs (placeholder when missing) ----
let DeepDiveTab: React.FC = () => (
  <div style={{ padding: 16 }}>Deep Dive (placeholder)</div>
);
try {
  DeepDiveTab = require("./tabs/DeepDiveTab").default || DeepDiveTab;
} catch {}
let LinkingTab: React.FC = () => (
  <div style={{ padding: 16 }}>Linking (placeholder)</div>
);
try {
  LinkingTab = require("./tabs/LinkingTab").default || LinkingTab;
} catch {}
let TopicMapperTab: React.FC = () => (
  <div style={{ padding: 16 }}>Topic Mapper (placeholder)</div>
);
try {
  TopicMapperTab = require("./tabs/TopicMapperTab").default || TopicMapperTab;
} catch {}
let CannibalizationTab: React.FC = () => (
  <div style={{ padding: 16 }}>Cannibalization (placeholder)</div>
);
try {
  CannibalizationTab =
    require("./tabs/CannibalizationTab").default || CannibalizationTab;
} catch {
  try {
    CannibalizationTab =
      require("./tabs/CannibalisationTab").default || CannibalizationTab;
  } catch {}
}

/* ---------------------- Workspace hook ---------------------- */
let useWorkspaceRef: any;
try {
  const ws = require("./context/WorkspaceContext");
  if (ws?.useWorkspace) useWorkspaceRef = ws.useWorkspace;
} catch {}
if (!useWorkspaceRef) {
  useWorkspaceRef = () => ({
    apiKey: "",
    state: { queriesCsv: [], embeddingsCsv: [], authorityCsv: [] },
  });
}

/* ---------------------- Hero status lights ---------------------- */
function LedDot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: 10,
        height: 10,
        borderRadius: 999,
        background: on ? "#10b981" : "#9ca3af",
        border: `1px solid ${on ? "#059669" : "#d1d5db"}`,
        boxShadow: on
          ? "0 0 0 2px rgba(16,185,129,0.18), 0 0 10px rgba(16,185,129,0.55)"
          : "none",
        display: "inline-block",
        transition: "all 150ms ease",
      }}
    />
  );
}

function StatusChipHero({
  on,
  label,
  Icon,
}: {
  on: boolean;
  label: string;
  Icon: React.FC<{
    size?: number;
    color?: string;
    style?: React.CSSProperties;
  }>;
}) {
  const text = on ? "#ffffff" : "#e5e7eb";
  const bg = "rgba(255,255,255,0.14)";
  const border = "rgba(255,255,255,0.35)";
  return (
    <span
      role="status"
      aria-live="polite"
      title={`${label}: ${on ? "Ready" : "Not loaded"}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        fontSize: 12,
        color: text,
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 999,
        backdropFilter: "blur(6px)",
      }}
    >
      <Icon size={14} color={text} />
      <span>{label}</span>
      <LedDot on={on} />
    </span>
  );
}

function HeroStatusGroup({
  showAuthority = true,
}: {
  showAuthority?: boolean;
}) {
  const ws: any = useWorkspaceRef!();
  const state = ws?.state ?? {
    queriesCsv: [],
    embeddingsCsv: [],
    authorityCsv: [],
  };
  const apiKey = typeof ws?.apiKey === "string" ? ws.apiKey : "";

  const apiOn = apiKey.trim().length > 0;
  const embeddingsOn = (state.embeddingsCsv?.length ?? 0) > 0;
  const keywordsOn = (state.queriesCsv?.length ?? 0) > 0;
  const authorityOn = (state.authorityCsv?.length ?? 0) > 0;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: 6,
        background: "rgba(255,255,255,0.10)",
        border: "1px solid rgba(255,255,255,0.30)",
        borderRadius: 999,
        backdropFilter: "blur(6px)",
      }}
    >
      <StatusChipHero on={apiOn} label="API" Icon={Sparkles} />
      <div
        style={{ width: 1, height: 16, background: "rgba(255,255,255,0.35)" }}
      />
      <StatusChipHero on={embeddingsOn} label="Embeddings" Icon={Network} />
      <div
        style={{ width: 1, height: 16, background: "rgba(255,255,255,0.35)" }}
      />
      <StatusChipHero on={keywordsOn} label="Keywords" Icon={Search} />
      {showAuthority && (
        <>
          <div
            style={{
              width: 1,
              height: 16,
              background: "rgba(255,255,255,0.35)",
            }}
          />
          <StatusChipHero on={authorityOn} label="Authority" Icon={Shield} />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

// 1. Updated TabKey type
type TabKey =
  | "workspace"
  | "generator"
  | "coverage"
  | "deepdive"
  | "linking"
  | "topics"
  | "cannibal"
  | "passage"
  | "test"
  | "aiMode"
  | "hubBuilder"
  | "expertise"
  | "clusterCompare";

// 2. Updated Tabs Array
const tabs: {
  key: TabKey;
  label: string;
  Icon: React.FC<{ size?: number }>;
}[] = [
  { key: "aiMode", label: "Start Here", Icon: Brain },
  { key: "workspace", label: "Workspace", Icon: Network },
  { key: "topics", label: "Fanout & Topic Mapper", Icon: Activity },
  { key: "coverage", label: "Clustering", Icon: Target },
  { key: "expertise", label: "Expertise Audit", Icon: Shield }, // 👈 Added to Nav
  { key: "linking", label: "Linking", Icon: LinkIcon },
  { key: "hubBuilder", label: "Topic Hub Builder", Icon: Network },
  { key: "clusterCompare", label: "Cluster Comparison", Icon: ArrowRightLeft },
  { key: "cannibal", label: "Cannibalization", Icon: Target },
];

/* ----- Inline styles ----- */
const S = {
  hero: {
    background:
      "linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #06b6d4 100%)",
    color: "#fff",
    padding: "20px 0 24px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.15)",
    boxShadow: "0 10px 20px rgba(0,0,0,0.06)",
  } as React.CSSProperties,
  heroInner: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "0 20px",
  } as React.CSSProperties,
  brandRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
  } as React.CSSProperties,
  brand: {
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: 0.2,
  } as React.CSSProperties,
  subtitle: {
    marginTop: 4,
    color: "#dbeafe",
    fontSize: 14,
  } as React.CSSProperties,
  badgesRow: {
    display: "flex",
    gap: 10,
    marginTop: 12,
    flexWrap: "wrap",
  } as React.CSSProperties,
  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 12px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.35)",
    background: "rgba(255,255,255,0.15)",
    fontSize: 12,
    fontWeight: 700,
    backdropFilter: "blur(6px)",
  } as React.CSSProperties,
  navWrap: {
    background: "#fff",
    borderBottom: "1px solid #e5e7eb",
    boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
  } as React.CSSProperties,
  navInner: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "0 20px",
  } as React.CSSProperties,
  tabs: {
    display: "flex",
    gap: 8,
    padding: "14px 0",
    overflowX: "auto",
  } as React.CSSProperties,
  tabBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "#f8fafc",
    color: "#374151",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    transition: "all .15s ease",
    whiteSpace: "nowrap",
  } as React.CSSProperties,
  tabActive: {
    background: "linear-gradient(135deg, #2563eb 0%, #1e40af 100%)",
    color: "#fff",
    borderColor: "#1e40af",
    boxShadow: "0 6px 12px rgba(37,99,235,0.18)",
  } as React.CSSProperties,
  main: {
    background: "#f7f8fb",
    minHeight: "calc(100vh - 160px)",
  } as React.CSSProperties,
  mainInner: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: 20,
  } as React.CSSProperties,
};

export default function App() {
  const [active, setActive] = useState<TabKey>("workspace");

  const renderActive = () => {
    switch (active) {
      case "workspace":
        return <WorkspaceTab />;
      case "generator":
        return <QueryGeneratorTab />;
      case "coverage":
        return <CoverageTab />;
      case "expertise": // 👈 4. Added Render Case
        return <ExpertiseTab />;
      case "deepdive":
        return <DeepDiveTab />;
      case "linking":
        return <LinkingTab />;
      case "topics":
        return <TopicMapperTab />;
      case "cannibal":
        return <CannibalizationTab />;
      case "aiMode":
        return <OptimisingForAIModeTab />;
      case "passage":
        return <PassageLabTab />;
      case "test":
        return <TestingTab />;
      default:
        return <QueryGeneratorTab />;
      case "hubBuilder":
        return <TopicHubBuilderTab />;
      case "clusterCompare": // 👈 Add this case
        return <ClusterComparisonTab />;
    }
  };

  return (
    <WorkspaceProvider>
      {/* Hero */}
      <header style={S.hero}>
        <div style={S.heroInner}>
          <div style={S.brandRow}>
            <div style={S.brand}>NEXUS</div>
            <HeroStatusGroup showAuthority />
          </div>
          <div style={S.subtitle}>
            Vector Embeddings • Semantic Analysis • AI Mode Optimization
          </div>
          <div style={S.badgesRow}>
            <span style={S.pill}>
              <Cpu size={16} /> Vector Analysis
            </span>
            <span style={S.pill}>
              <Network size={16} /> Semantic Mapping
            </span>
            <span style={S.pill}>
              <Shield size={16} /> Patent-Based
            </span>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav style={S.navWrap} role="navigation" aria-label="Primary">
        <div style={S.navInner}>
          <div style={S.tabs} role="tablist" aria-label="Nexus sections">
            {tabs.map(({ key, label, Icon }) => (
              <button
                key={key}
                id={`tab-${key}`}
                role="tab"
                aria-selected={active === key}
                aria-controls={`panel-${key}`}
                onClick={() => setActive(key)}
                style={{ ...S.tabBtn, ...(active === key ? S.tabActive : {}) }}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Body */}
      <main style={S.main}>
        <div style={S.mainInner}>
          <Suspense fallback={<div style={{ padding: 16 }}>Loading…</div>}>
            <section
              id={`panel-${active}`}
              role="tabpanel"
              aria-labelledby={`tab-${active}`}
            >
              {renderActive()}
            </section>
          </Suspense>
        </div>
      </main>
    </WorkspaceProvider>
  );
}
