import React, { useState, useMemo } from "react";
import {
  ArrowRightLeft,
  BarChart3,
  CheckCircle2,
  PlusCircle,
  MinusCircle,
  Zap,
  Target,
  AlertTriangle,
  Download,
  Trash2,
  Check,
} from "lucide-react";
import {
  cosineSimilarity,
  calculateGlobalCentroid,
  EmbeddingRow,
} from "../lib/expertiseMetrics";

/* --------------------- CSV Helpers (Consolidated) --------------------- */
function parseCsvRows(text: string): Array<Record<string, string>> {
  const lines = (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const split = (line: string) => {
    const cells: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (ch === "," && !inQ) {
        cells.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    return cells.map((c) => c.trim().replace(/^"|"$/g, ""));
  };
  let header = split(lines[0]);
  let dataStartIndex = 1;
  if (!header.some((h) => /url|address|score|embedding/i.test(h))) {
    for (let i = 1; i < Math.min(lines.length, 10); i++) {
      const testHeader = split(lines[i]);
      if (testHeader.some((h) => /url|address|score|embedding/i.test(h))) {
        header = testHeader;
        dataStartIndex = i + 1;
        break;
      }
    }
  }
  return lines.slice(dataStartIndex).map((line) => {
    const vals = split(line);
    const row: Record<string, string> = {};
    header.forEach((h, idx) => {
      if (h) row[h] = vals[idx] || "";
    });
    return row;
  });
}

function parseEmbedding(text: string): number[] | null {
  if (!text) return null;
  try {
    const clean = text.replace(/[\[\]\s]/g, "");
    return clean.split(",").map(Number);
  } catch {
    return null;
  }
}

/* ----------------------------- Component ----------------------------- */
const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 24,
    maxWidth: 1200,
    margin: "0 auto",
  },
  header: {
    fontSize: 26,
    fontWeight: 800,
    color: "#111827",
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 },
  card: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 24,
  },
  uploadArea: {
    border: "2px dashed #cbd5e1",
    borderRadius: 8,
    padding: 20,
    textAlign: "center",
    background: "#f8fafc",
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 8,
    display: "block",
  },
  metricValue: { fontSize: 32, fontWeight: 800, color: "#0f172a" },
  statGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 },
  statCard: {
    padding: 16,
    borderRadius: 10,
    border: "1px solid #f1f5f9",
    textAlign: "center",
  },
  tableWrap: {
    marginTop: 12,
    maxHeight: 450,
    overflowY: "auto",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
  },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    textAlign: "left",
    fontSize: 11,
    background: "#f8fafc",
    padding: "12px 10px",
    borderBottom: "1px solid #e2e8f0",
    position: "sticky",
    top: 0,
    fontWeight: 700,
  },
  td: {
    padding: "10px",
    fontSize: 13,
    borderBottom: "1px solid #f1f5f9",
    color: "#334155",
  },
  badge: (bg: string, fg: string) => ({
    fontSize: 10,
    fontWeight: 800,
    padding: "2px 8px",
    borderRadius: 99,
    background: bg,
    color: fg,
  }),
  btnAction: (active: boolean, color: string) => ({
    padding: "4px 8px",
    borderRadius: 6,
    border: `1px solid ${active ? color : "#d1d5db"}`,
    background: active ? color : "#fff",
    color: active ? "#fff" : "#6b7280",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 4,
  }),
  exportPanel: {
    position: "sticky",
    bottom: 24,
    background: "#1e293b",
    color: "#fff",
    padding: "16px 24px",
    borderRadius: 12,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
  },
};

export default function ClusterComparisonTab() {
  const [clusterA, setClusterA] = useState<EmbeddingRow[]>([]);
  const [clusterB, setClusterB] = useState<EmbeddingRow[]>([]);
  const [names, setNames] = useState({ a: "Current Hub", b: "Suggested Hub" });

  // 🚀 New State: Tracks which URLs the user has selected for the NEW cluster
  const [curatedUrls, setCuratedUrls] = useState<Set<string>>(new Set());

  const handleUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    target: "a" | "b"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const rows = parseCsvRows(event.target?.result as string);
      const mapped = rows
        .map((r) => {
          const urlKey = Object.keys(r).find((k) =>
            /url|address|page/i.test(k)
          );
          const embedKey = Object.keys(r).find((k) =>
            /embedding|score|similarity|relevance/i.test(k)
          );
          return {
            url: urlKey ? r[urlKey] : "Unknown",
            embedding: embedKey ? parseEmbedding(r[embedKey]) : null,
          };
        })
        .filter(
          (r) => r.embedding !== null && r.url !== "Unknown"
        ) as EmbeddingRow[];

      if (target === "a") setClusterA(mapped);
      else {
        setClusterB(mapped);
        // Default behavior: Auto-select suggested URLs for convenience
        setCuratedUrls(new Set(mapped.map((p) => p.url)));
      }
    };
    reader.readAsText(file);
  };

  const audit = useMemo(() => {
    if (!clusterA.length || !clusterB.length) return null;
    const urlsA = new Set(clusterA.map((p) => p.url));
    const urlsB = new Set(clusterB.map((p) => p.url));

    // Membership Lists
    const alreadyTagged = clusterB.filter((p) => urlsA.has(p.url));
    const newDiscoveries = clusterB.filter((p) => !urlsA.has(p.url));
    const dropped = clusterA.filter((p) => !urlsB.has(p.url));

    // Vector Math
    const centroidA = calculateGlobalCentroid(clusterA);
    const centroidB = calculateGlobalCentroid(clusterB);
    const overlapSimilarity = cosineSimilarity(centroidA, centroidB);

    return {
      overlapSimilarity,
      alreadyTagged,
      newDiscoveries,
      dropped,
      overlapPct: (alreadyTagged.length / clusterB.length) * 100,
    };
  }, [clusterA, clusterB]);

  const toggleUrl = (url: string) => {
    const next = new Set(curatedUrls);
    if (next.has(url)) next.delete(url);
    else next.add(url);
    setCuratedUrls(next);
  };

  const handleExportNewCluster = () => {
    // Combine both clusters to find the embeddings for the curated URLs
    const masterPool = [...clusterA, ...clusterB];
    const exportData = Array.from(curatedUrls).map((url) => {
      const match = masterPool.find((p) => p.url === url);
      return [url, `"[${match?.embedding?.join(",") || ""}]"`];
    });

    const csvContent = [["URL", "Embedding"], ...exportData]
      .map((r) => r.join(","))
      .join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Curated_Cluster_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
  };

  return (
    <div style={styles.page}>
      <h2 style={styles.header}>
        <ArrowRightLeft color="#6366f1" /> Hub Refinement & Curation
      </h2>

      <div style={styles.grid}>
        <div style={styles.card}>
          <label style={styles.metricLabel}>Baseline (Cluster 1)</label>
          <input
            style={{
              width: "100%",
              padding: 8,
              marginBottom: 12,
              borderRadius: 6,
              border: "1px solid #ddd",
            }}
            value={names.a}
            onChange={(e) => setNames({ ...names, a: e.target.value })}
          />
          <div style={styles.uploadArea}>
            <input type="file" onChange={(e) => handleUpload(e, "a")} />
          </div>
        </div>
        <div style={styles.card}>
          <label style={styles.metricLabel}>Suggested (Cluster 2)</label>
          <input
            style={{
              width: "100%",
              padding: 8,
              marginBottom: 12,
              borderRadius: 6,
              border: "1px solid #ddd",
            }}
            value={names.b}
            onChange={(e) => setNames({ ...names, b: e.target.value })}
          />
          <div style={styles.uploadArea}>
            <input type="file" onChange={(e) => handleUpload(e, "b")} />
          </div>
        </div>
      </div>

      {audit && (
        <>
          <div style={styles.statGrid}>
            <div style={{ ...styles.statCard, background: "#ecfdf5" }}>
              <CheckCircle2
                size={18}
                color="#10b981"
                style={{ margin: "0 auto 8px" }}
              />
              <div style={styles.metricLabel}>Already Tagged</div>
              <div style={styles.metricValue}>{audit.alreadyTagged.length}</div>
            </div>
            <div style={{ ...styles.statCard, background: "#eff6ff" }}>
              <PlusCircle
                size={18}
                color="#3b82f6"
                style={{ margin: "0 auto 8px" }}
              />
              <div style={styles.metricLabel}>New Discoveries</div>
              <div style={styles.metricValue}>
                {audit.newDiscoveries.length}
              </div>
            </div>
            <div style={{ ...styles.statCard, background: "#fef2f2" }}>
              <MinusCircle
                size={18}
                color="#ef4444"
                style={{ margin: "0 auto 8px" }}
              />
              <div style={styles.metricLabel}>Dropped/Missing</div>
              <div style={styles.metricValue}>{audit.dropped.length}</div>
            </div>
          </div>

          <div style={styles.card}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <label style={styles.metricLabel}>
                Interactive Refinement Table
              </label>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                Toggle <strong>Keep</strong> to include a page in your new
                cluster export.
              </div>
            </div>

            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>URL</th>
                    <th style={styles.th}>Source Status</th>
                    <th style={styles.th}>Refinement Action</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ...audit.newDiscoveries,
                    ...audit.alreadyTagged,
                    ...audit.dropped,
                  ].map((p) => (
                    <tr key={p.url}>
                      <td style={styles.td}>
                        <a
                          href={p.url}
                          target="_blank"
                          style={{ color: "#2563eb", textDecoration: "none" }}
                        >
                          {p.url}
                        </a>
                      </td>
                      <td style={styles.td}>
                        {audit.newDiscoveries.some((x) => x.url === p.url) && (
                          <span style={styles.badge("#eff6ff", "#1d4ed8")}>
                            NEW DISCOVERY
                          </span>
                        )}
                        {audit.alreadyTagged.some((x) => x.url === p.url) && (
                          <span style={styles.badge("#ecfdf5", "#059669")}>
                            ALREADY TAGGED
                          </span>
                        )}
                        {audit.dropped.some((x) => x.url === p.url) && (
                          <span style={styles.badge("#fef2f2", "#dc2626")}>
                            DROPPED
                          </span>
                        )}
                      </td>
                      <td style={styles.td}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => toggleUrl(p.url)}
                            style={styles.btnAction(
                              curatedUrls.has(p.url),
                              "#10b981"
                            )}
                          >
                            {curatedUrls.has(p.url) ? (
                              <Check size={12} />
                            ) : null}{" "}
                            Keep
                          </button>
                          {!curatedUrls.has(p.url) && (
                            <span
                              style={{
                                fontSize: 11,
                                color: "#ef4444",
                                fontWeight: 700,
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <Trash2 size={12} /> Removed
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={styles.exportPanel}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                Curated Cluster Ready
              </div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                {curatedUrls.size} pages selected for your new Topic Hub.
              </div>
            </div>
            <button
              onClick={handleExportNewCluster}
              style={{
                background: "#10b981",
                color: "#fff",
                border: "none",
                padding: "10px 20px",
                borderRadius: 8,
                fontWeight: 800,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Download size={18} /> Export New Cluster (.csv)
            </button>
          </div>
        </>
      )}

      {!audit && (
        <div style={{ textAlign: "center", padding: 100, color: "#94a3b8" }}>
          <BarChart3
            size={48}
            style={{ margin: "0 auto 16px", opacity: 0.5 }}
          />
          <h3>Awaiting Hub Files</h3>
          <p>
            Upload your current and suggested hubs to start curating your new
            master cluster.
          </p>
        </div>
      )}
    </div>
  );
}
