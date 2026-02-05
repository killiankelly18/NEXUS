// src/features/topic-mapper/TopicMapPanel.tsx
import React, { useMemo, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  ChevronRight,
  ChevronDown,
  Target,
  AlertCircle,
} from "lucide-react";

/* --- Types (Matching compute.ts) --- */
type TMRow = {
  label: string; // keyword / query
  url?: string;
  score?: number;
  subtopic?: string;
  type?: string;
  userJourneyStage?: string;
  commercialIntent?: string;
  priority?: string;
  reasoning?: string;
  contentOpportunity?: string;
};

type TMResults = {
  topic: { label: string; url?: string; score?: number };
  subtopics: Array<{ label: string; url?: string; score?: number }>;
  queries: TMRow[];
  finalScore?: number;
  analyzedPages?: number;
};

/* --- Helper: Score to Content Label (6 Tiers) --- */
function getContentLabel(
  score: number
):
  | "Content Gap"
  | "Weak Coverage"
  | "Medium Coverage"
  | "Strong Coverage"
  | "Excellent"
  | "Excellent (Cannibalization Risk)" {
  if (score >= 90) {
    return "Excellent (Cannibalization Risk)";
  }
  if (score >= 80) {
    return "Excellent";
  }
  if (score >= 70) {
    return "Strong Coverage";
  }
  if (score >= 60) {
    return "Medium Coverage";
  }
  if (score >= 55) {
    return "Weak Coverage";
  }
  return "Content Gap"; // Anything less than 55
}

/* --- Styles --- */
const styles: Record<string, React.CSSProperties> = {
  panel: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  },
  header: {
    padding: "16px 20px",
    borderBottom: "1px solid #e5e7eb",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "#f9fafb",
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    color: "#111827",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  controls: { display: "flex", gap: 8 },
  btn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 12px",
    borderRadius: 6,
    border: "1px solid #d1d5db",
    background: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    color: "#374151",
  },
  btnPrimary: {
    background: "#eff6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
  },

  // Tree View
  tree: { padding: 20, overflowY: "auto", flex: 1 },
  node: { marginBottom: 12 },
  nodeHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px",
    borderRadius: 6,
    cursor: "pointer",
    transition: "background 0.1s",
  },
  nodeLabel: { fontSize: 14, fontWeight: 600, color: "#1f2937", flex: 1 },
  scoreBadge: (score: number) => ({
    fontSize: 12,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 99,
    background: score >= 80 ? "#dcfce7" : score >= 60 ? "#fef9c3" : "#fee2e2",
    color: score >= 80 ? "#166534" : score >= 60 ? "#854d0e" : "#991b1b",
  }),

  // Query List
  queryList: {
    paddingLeft: 28,
    marginTop: 4,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  // 💡 MODIFIED: Added one more column for the new label
  queryItem: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 140px 80px", // Adjusted column width for the longer label
    gap: 12,
    padding: "6px 8px",
    borderBottom: "1px solid #f3f4f6",
    fontSize: 13,
    alignItems: "center",
  },
  url: {
    color: "#2563eb",
    textDecoration: "none",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: 300,
    fontSize: 12,
  },
  meta: { fontSize: 11, color: "#6b7280" },

  // 💡 NEW: Style for the 6-tier label badge
  labelBadge: (label: string) => {
    let background: string;
    let color: string;

    if (label.includes("Cannibalization")) {
      background = "#fff0f0"; // Light pink for risk
      color = "#991b1b";
    } else if (label === "Excellent") {
      background = "#dcfce7"; // Green for top match
      color = "#166534";
    } else if (label === "Strong Coverage") {
      background = "#dbeafe"; // Light Blue
      color = "#1d4ed8";
    } else if (label === "Medium Coverage") {
      background = "#fef9c3"; // Yellow
      color = "#854d0e";
    } else if (label === "Weak Coverage") {
      background = "#fef2f2"; // Light Red
      color = "#991b1b";
    } else {
      // Content Gap
      background = "#fee2e2";
      color = "#991b1b";
    }

    return {
      fontSize: 11,
      fontWeight: 700,
      padding: "2px 6px",
      borderRadius: 4,
      background,
      color,
      textAlign: "center" as const,
    };
  },
};

/* --- Helper: CSV Download --- */
function downloadCsvFile(filename: string, csvContent: string) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const TopicMapPanel: React.FC<{ tmResults: TMResults }> = ({ tmResults }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (label: string) => {
    setExpanded((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  // Standard Export (The raw data)
  const exportRaw = () => {
    const header = [
      "Type",
      "Label",
      "Subtopic",
      "URL",
      "Score",
      "Intent",
      "Stage",
    ];
    const rows = tmResults.queries.map((q) => [
      "Query",
      `"${q.label.replace(/"/g, '""')}"`,
      `"${q.subtopic || ""}"`,
      q.url || "",
      (q.score || 0).toString(),
      q.commercialIntent || "",
      q.userJourneyStage || "",
    ]);
    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
    downloadCsvFile(
      `nexus_topic_map_${new Date().toISOString().slice(0, 10)}.csv`,
      csv
    );
  };

  // 🚀 NEW: AIO Optimization Tracker Export (Matches the Screenshot)
  const exportTracker = () => {
    const header = [
      "Keyword",
      "Topic/Subtopic",
      "URL",
      "Search Intent",
      "Content Relevance Score",
      "Content Formats (Inferred)",
      "Follow Up Keywords (Cluster)",
      "Notes",
    ];

    // Group queries by subtopic to generate "Follow Up Keywords" list
    const queriesBySubtopic: Record<string, string[]> = {};
    tmResults.queries.forEach((q) => {
      const key = q.subtopic || "General";
      if (!queriesBySubtopic[key]) queriesBySubtopic[key] = [];
      queriesBySubtopic[key].push(q.label);
    });

    const rows = tmResults.queries.map((q) => {
      const subtopic = q.subtopic || "General";

      // Get 3 other keywords from the same bucket as "Follow Up Keywords"
      const clusterKeywords = (queriesBySubtopic[subtopic] || [])
        .filter((k) => k !== q.label)
        .slice(0, 3)
        .join(" • ");

      return [
        `"${q.label.replace(/"/g, '""')}"`, // Keyword
        `"${tmResults.topic.label} > ${subtopic}"`, // Topic/Subtopic
        q.url || "MISSING PAGE", // URL
        `"${q.commercialIntent || ""} / ${q.userJourneyStage || ""}"`, // Search Intent
        `${(q.score || 0).toFixed(1)}%`, // Content Relevance Score
        q.url?.includes("/blog/") ? "Blog Post" : "Landing Page", // Inferred Format
        `"${clusterKeywords}"`, // Follow Up Keywords
        (q.score || 0) < 60
          ? "GAP: Needs Content"
          : (q.score || 0) < 80
          ? "Optimization Candidate"
          : "Strong", // Notes
      ];
    });

    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
    downloadCsvFile(
      `AIO_Optimization_Tracker_${tmResults.topic.label}.csv`,
      csv
    );
  };

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.title}>
          <Target size={20} color="#2563eb" />
          <span>{tmResults.topic.label}</span>
          <span style={styles.scoreBadge(tmResults.finalScore || 0) as any}>
            {tmResults.finalScore}/100
          </span>
        </div>
        <div style={styles.controls}>
          <button style={styles.btn} onClick={exportRaw}>
            <Download size={14} /> Raw CSV
          </button>
          {/* 🚀 The New Tracker Export Button */}
          <button
            style={{ ...styles.btn, ...styles.btnPrimary }}
            onClick={exportTracker}
          >
            <FileSpreadsheet size={14} /> AIO Tracker Export
          </button>
        </div>
      </div>

      {/* Tree View */}
      <div style={styles.tree}>
        {tmResults.subtopics.map((sub, i) => {
          const isOpen = expanded[sub.label] !== false; // Default open
          const subQueries = tmResults.queries.filter(
            (q) => q.subtopic === sub.label
          );

          return (
            <div key={i} style={styles.node}>
              {/* Subtopic Header */}
              <div style={styles.nodeHeader} onClick={() => toggle(sub.label)}>
                {isOpen ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
                <span style={styles.nodeLabel}>{sub.label}</span>
                <span style={styles.scoreBadge(sub.score || 0) as any}>
                  {sub.score}%
                </span>
              </div>

              {/* Query Rows */}
              {isOpen && (
                <div style={styles.queryList}>
                  <div
                    style={{
                      ...styles.queryItem,
                      background: "#f9fafb",
                      fontWeight: 700,
                      color: "#6b7280",
                    }}
                  >
                    <span>Query</span>
                    <span>Best URL</span>
                    <span>Label</span> {/* 💡 NEW Column Header */}
                    <span>Score</span>
                  </div>
                  {subQueries.map((q, j) => {
                    const score = q.score || 0;
                    const label = getContentLabel(score); // 💡 Get the label
                    return (
                      <div key={j} style={styles.queryItem}>
                        <div>
                          <div style={{ fontWeight: 500 }}>{q.label}</div>
                          <div style={styles.meta}>
                            {q.commercialIntent} • {q.userJourneyStage}
                          </div>
                        </div>

                        {q.url ? (
                          <a
                            href={q.url}
                            target="_blank"
                            rel="noreferrer"
                            style={styles.url}
                          >
                            {q.url}
                          </a>
                        ) : (
                          <span style={{ ...styles.meta, color: "#dc2626" }}>
                            No Match
                          </span>
                        )}

                        {/* 💡 NEW Label Badge */}
                        <span style={styles.labelBadge(label) as any}>
                          {label}
                        </span>

                        <span
                          style={{
                            fontWeight: 700,
                            color: score > 80 ? "#166534" : "#991b1b",
                          }}
                        >
                          {score}%
                        </span>
                      </div>
                    );
                  })}
                  {subQueries.length === 0 && (
                    <div
                      style={{
                        padding: 8,
                        color: "#9ca3af",
                        fontStyle: "italic",
                      }}
                    >
                      No queries generated for this subtopic.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TopicMapPanel;
