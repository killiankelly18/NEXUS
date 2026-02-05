// src/tabs/ExpertiseTab.tsx
import React, { useMemo, useState } from "react";
import { useWorkspace } from "../context/WorkspaceContext";
import { generateExpertiseReport, EmbeddingRow } from "../lib/expertiseMetrics";
import { downloadCSV } from "../lib/utils";
import {
  Target,
  Info,
  ChevronDown,
  ChevronRight,
  BookOpen,
  AlertTriangle,
  Download,
} from "lucide-react";

/* --- Styles --- */
const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 24,
    maxWidth: 1200,
    margin: "0 auto",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  header: {
    fontSize: 26,
    fontWeight: 800,
    color: "#111827",
    display: "flex",
    alignItems: "center",
    gap: 12,
    margin: 0,
  },

  // Controls
  exportBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 16px",
    background: "#fff",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    fontWeight: 600,
    color: "#374151",
    cursor: "pointer",
    transition: "background 0.2s",
  },

  // Info Panel
  infoBox: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    overflow: "hidden",
  },
  infoHeader: {
    padding: "12px 16px",
    display: "flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    fontWeight: 600,
    color: "#334155",
  },
  infoBody: {
    padding: "0 16px 16px",
    color: "#475569",
    fontSize: 14,
    lineHeight: 1.6,
  },

  // Cards
  card: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 24,
    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 20,
  },

  // Metrics
  metricLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 42,
    fontWeight: 800,
    color: "#0f172a",
    marginTop: 4,
    lineHeight: 1,
  },
  subtext: { fontSize: 13, color: "#6b7280", marginTop: 8 },

  // Visual Bar
  barBg: {
    height: 8,
    width: "100%",
    background: "#f1f5f9",
    borderRadius: 4,
    marginTop: 12,
    overflow: "hidden",
  },
  barFill: (color: string, pct: number) => ({
    height: "100%",
    width: `${pct}%`,
    background: color,
    borderRadius: 4,
    transition: "width 0.5s ease",
  }),

  // Tables
  table: { width: "100%", borderCollapse: "collapse", marginTop: 16 },
  th: {
    textAlign: "left",
    padding: "12px 8px",
    fontSize: 12,
    color: "#64748b",
    borderBottom: "2px solid #e2e8f0",
    fontWeight: 700,
  },
  td: {
    padding: "12px 8px",
    fontSize: 14,
    borderBottom: "1px solid #f1f5f9",
    verticalAlign: "top",
    color: "#334155",
  },
  url: {
    display: "block",
    maxWidth: 340,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: "#2563eb",
    textDecoration: "none",
    fontWeight: 500,
  },
  badge: {
    display: "inline-flex",
    padding: "2px 10px",
    borderRadius: 99,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.3,
  },
};

function getScoreColor(score: number) {
  if (score >= 0.75) return "#059669"; // Green (Core)
  if (score >= 0.65) return "#d97706"; // Yellow (Peripheral)
  return "#dc2626"; // Red (Drift/Risk)
}

function getScoreLabel(score: number) {
  if (score >= 0.75) return "Strong Focus";
  if (score >= 0.65) return "Peripheral Topic"; // Matched to UI terminology
  return "High Drift (Risk)";
}

export default function ExpertiseTab() {
  const { siteEmbeddings } = useWorkspace();
  const [showInfo, setShowInfo] = useState(true);

  // Adapter
  const data: EmbeddingRow[] = useMemo(
    () =>
      (siteEmbeddings || []).map((e: any) => ({
        url: e.url,
        embedding: e.embedding,
        wordCount: e.wordCount,
      })),
    [siteEmbeddings]
  );

  const report = useMemo(() => {
    if (!data.length) return null;
    return generateExpertiseReport(data);
  }, [data]);

  // Handler: Export CSV
  const handleExport = () => {
    if (!report || !report.allScoredPages) return;

    // 1. Build the Data Rows with UI-matched labels
    const dataRows = report.allScoredPages.map((p) => {
      // Logic aligns with getScoreLabel() used in UI
      let statusLabel = "Strong Focus";
      if (p.score < 0.65) statusLabel = "High Drift (Risk)";
      else if (p.score < 0.75) statusLabel = "Peripheral Topic";

      return [
        p.url,
        p.score.toFixed(4), // Raw score
        (p.score * 100).toFixed(1) + "%", // % score
        p.segment || "root", // Folder segment
        p.wordCount ? p.wordCount.toString() : "0",
        statusLabel,
      ];
    });

    // 2. Build the Summary / Score Sheet Section
    // We add empty strings "" to maintain column alignment for CSV viewers
    const summarySection = [
      ["EXPERTISE AUDIT SCORE SHEET", "", "", "", "", ""],
      [
        "Generated Date",
        new Date().toISOString().split("T")[0],
        "",
        "",
        "",
        "",
      ],
      ["", "", "", "", "", ""], // Spacer
      ["METRIC", "VALUE", "NOTES", "", "", ""],
      [
        "Site Focus Score",
        (report.focusScore * 100).toFixed(1),
        "Target > 75.0 (Higher is tighter topical authority)",
        "",
        "",
        "",
      ],
      [
        "Max Drift (Radius)",
        (report.radiusMetrics.min * 100).toFixed(1),
        "Score of furthest page (< 65.0 indicates high drift)",
        "",
        "",
        "",
      ],
      [
        "Corpus Size",
        report.datasetSize.toString(),
        "Total pages analyzed",
        "",
        "",
        "",
      ],
      ["", "", "", "", "", ""], // Spacer
      ["PAGE DRIFT ANALYSIS", "", "", "", "", ""], // Section Header
    ];

    // 3. Define Table Header
    const tableHeader = [
      "URL",
      "Cosine Score",
      "Relevance %",
      "Segment",
      "Word Count",
      "Risk Level",
    ];

    // 4. Combine Everything
    const finalCsvData = [...summarySection, tableHeader, ...dataRows];

    downloadCSV("Expertise_Audit_ScoreSheet.csv", finalCsvData);
  };

  if (!data.length)
    return (
      <div style={styles.page}>
        <div style={styles.header}>
          <Target /> Expertise Audit
        </div>
        <div style={{ ...styles.card, textAlign: "center", color: "#6b7280" }}>
          Please upload <strong>Page Embeddings</strong> in the Workspace tab to
          run this audit.
        </div>
      </div>
    );

  if (!report) return <div style={styles.page}>Analyzing topology...</div>;

  const outlierPercent = Math.round(
    (report.outliers.length / report.datasetSize) * 100
  );
  const focusColor = getScoreColor(report.focusScore);
  const radiusColor = getScoreColor(report.radiusMetrics.min);

  return (
    <div style={styles.page}>
      {/* Header Row with Export Button */}
      <div style={styles.headerRow}>
        <div style={styles.header}>
          <Target size={28} /> Expertise & Focus Audit
        </div>
        <button
          style={styles.exportBtn}
          onClick={handleExport}
          title="Download Score Sheet & Full Report"
        >
          <Download size={16} /> Export Score Sheet
        </button>
      </div>

      {/* Collapsible Info Panel */}
      <div style={styles.infoBox}>
        <div style={styles.infoHeader} onClick={() => setShowInfo(!showInfo)}>
          <Info size={18} color="#3b82f6" />
          <span>How this works & Use Cases</span>
          <div style={{ marginLeft: "auto" }}>
            {showInfo ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>
        </div>
        {showInfo && (
          <div style={styles.infoBody}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 24,
              }}
            >
              <div>
                <strong style={{ color: "#1e293b" }}>🔬 How It Works</strong>
                <ul style={{ margin: "8px 0 0 16px", padding: 0 }}>
                  <li>
                    <strong>Global Centroid:</strong> We calculate the
                    mathematical "center" of your site's content using vector
                    embeddings.
                  </li>
                  <li>
                    <strong>Site Focus Score:</strong> Measures how tightly your
                    pages cluster around that center. High score = High
                    Authority niche.
                  </li>
                  <li>
                    <strong>Drift Analysis:</strong> Identifies pages that are
                    mathematically furthest from your core expertise.
                  </li>
                </ul>
              </div>
              <div>
                <strong style={{ color: "#1e293b" }}>🛠️ Use Cases</strong>
                <ul style={{ margin: "8px 0 0 16px", padding: 0 }}>
                  <li>
                    <strong>Audit Quality:</strong> Find off-topic "drift" that
                    dilutes your topical authority.
                  </li>
                  <li>
                    <strong>Pruning:</strong> Identify low-relevance outliers to
                    delete or merge.
                  </li>
                  <li>
                    <strong>Hub Finding:</strong> Use the segments with the
                    highest scores as your "Core Pillars".
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Top Level Metrics */}
      <div style={styles.grid}>
        {/* Card 1: Focus Score */}
        <div style={styles.card}>
          <div style={styles.metricLabel}>Site Focus Score</div>
          <div style={{ ...styles.metricValue, color: focusColor }}>
            {(report.focusScore * 100).toFixed(1)}
          </div>

          {/* Visual Bar */}
          <div style={styles.barBg}>
            <div
              style={styles.barFill(focusColor, report.focusScore * 100) as any}
            />
          </div>

          <div style={styles.subtext}>
            <strong>{getScoreLabel(report.focusScore)}</strong>. Average
            similarity to your core topic.
            <br />
            Target: &gt; 75.0
          </div>
        </div>

        {/* Card 2: Max Drift */}
        <div style={styles.card}>
          <div style={styles.metricLabel}>Max Drift (Radius)</div>
          <div style={{ ...styles.metricValue, color: radiusColor }}>
            {(report.radiusMetrics.min * 100).toFixed(1)}
          </div>
          {/* Visual Bar */}
          <div style={styles.barBg}>
            <div
              style={
                styles.barFill(
                  radiusColor,
                  report.radiusMetrics.min * 100
                ) as any
              }
            />
          </div>
          <div style={styles.subtext}>
            Score of the furthest page. Pages below <strong>65.0</strong> are
            considered high-risk drift.
          </div>
        </div>

        {/* Card 3: Stats */}
        <div style={styles.card}>
          <div style={styles.metricLabel}>Corpus Size</div>
          <div style={styles.metricValue}>
            {report.datasetSize.toLocaleString()}
          </div>
          <div style={styles.subtext}>
            <BookOpen
              size={14}
              style={{ display: "inline", verticalAlign: "middle" }}
            />{" "}
            Pages analyzed
            <br />
            <AlertTriangle
              size={14}
              style={{
                display: "inline",
                verticalAlign: "middle",
                color: "#d97706",
              }}
            />{" "}
            {report.outliers.length} outliers detected (Bottom {outlierPercent}
            %)
          </div>
        </div>
      </div>

      <div style={styles.grid}>
        {/* Outliers Table */}
        <div style={styles.card}>
          <h3 style={{ margin: "0 0 4px 0", fontSize: 18 }}>
            🚩 Drift Candidates
          </h3>
          <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
            These pages are mathematically furthest from your site's center.
            Review for pruning or updating.
          </p>

          <div style={{ maxHeight: 400, overflowY: "auto", marginTop: 12 }}>
            <table style={styles.table}>
              <thead style={{ position: "sticky", top: 0, background: "#fff" }}>
                <tr>
                  <th style={styles.th}>Page</th>
                  <th style={styles.th}>Relevance</th>
                  <th style={styles.th}>Risk Level</th>
                </tr>
              </thead>
              <tbody>
                {report.outliers.map((o) => (
                  <tr key={o.url}>
                    <td style={styles.td}>
                      <a
                        href={o.url}
                        target="_blank"
                        rel="noreferrer"
                        style={styles.url}
                        title={o.url}
                      >
                        {o.url}
                      </a>
                    </td>
                    <td
                      style={{
                        ...styles.td,
                        fontWeight: 700,
                        color: getScoreColor(o.score),
                      }}
                    >
                      {(o.score * 100).toFixed(1)}
                    </td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.badge,
                          background: o.score < 0.65 ? "#fee2e2" : "#fef3c7",
                          color: o.score < 0.65 ? "#dc2626" : "#d97706",
                        }}
                      >
                        {o.reason}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Segments Table */}
        <div style={styles.card}>
          <h3 style={{ margin: "0 0 4px 0", fontSize: 18 }}>
            📂 Focus by Folder
          </h3>
          <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
            Which sections of your site are the most focused?
          </p>

          <div style={{ maxHeight: 400, overflowY: "auto", marginTop: 12 }}>
            <table style={styles.table}>
              <thead style={{ position: "sticky", top: 0, background: "#fff" }}>
                <tr>
                  <th style={styles.th}>Segment</th>
                  <th style={styles.th}>Pages</th>
                  <th style={styles.th}>Avg Score</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(report.segments)
                  .sort((a, b) => b[1].score - a[1].score) // Highest focus first
                  .map(([seg, stats]) => (
                    <tr key={seg}>
                      <td style={{ ...styles.td, fontWeight: 600 }}>/{seg}</td>
                      <td style={styles.td}>{stats.count}</td>
                      <td
                        style={{
                          ...styles.td,
                          color: getScoreColor(stats.score),
                          fontWeight: 700,
                        }}
                      >
                        {(stats.score * 100).toFixed(1)}
                      </td>
                    </tr>
                  ))}
                {Object.keys(report.segments).length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      style={{
                        ...styles.td,
                        color: "#9ca3af",
                        textAlign: "center",
                        padding: 20,
                      }}
                    >
                      No folder segments found (URLs might be root only).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
