// src/tabs/TopicMapperTab.tsx
import React, { useMemo, useState } from "react";
import * as Icons from "../components/icons";

import {
  splitIntoSubtopics,
  generateSyntheticQueries,
} from "../features/topic-mapper/fanout";

import {
  tmMapNodesToContent,
  tmComputeFinalScore,
} from "../features/topic-mapper/compute";

import { useWorkspace } from "../context/WorkspaceContext";
import TopicMapPanel from "../features/topic-mapper/TopicMapPanel";

/* ----------------------------- Styling (visual only) ----------------------------- */
/* ----------------------------- Styling (visual only) ----------------------------- */
const styles: Record<string, React.CSSProperties> = {
  page: { padding: 24, display: "flex", flexDirection: "column", gap: 16 },
  header: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    marginTop: 0,
    fontSize: 22,
    fontWeight: 800,
    color: "#111827",
  },
  infoPanel: {
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    color: "#1e40af",
    padding: 16,
    borderRadius: 12,
  },
  successPanel: {
    background: "#ecfdf5",
    border: "1px solid #a7f3d0",
    color: "#065f46",
    padding: 12,
    borderRadius: 10,
  },
  errorPanel: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#991b1b",
    padding: 12,
    borderRadius: 10,
  },
  dashedHint: {
    marginTop: 12,
    padding: 16,
    border: "2px dashed #e5e7eb",
    borderRadius: 12,
    color: "#6b7280",
    textAlign: "center",
  },
  card: {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    background: "#fff",
  },
  cardHeader: {
    padding: 12,
    background: "#fafafa",
    fontWeight: 700,
    borderBottom: "1px solid #f3f4f6", // ✅ fixed quotes
  },
  input: {
    padding: "10px 12px", // ✅ removed stray quote
    borderRadius: 8,
    border: "1px solid #e5e7eb",
  },
  uploadWrap: {
    border: "1px dashed #d1d5db",
    padding: 12,
    borderRadius: 10,
    background: "#fafafa",
  },
  primaryBtn: {
    background: "linear-gradient(90deg, #3b82f6, #6366f1)",
    color: "#fff",
    padding: "10px 14px",
    borderRadius: 10,
    border: "none",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 6px 18px rgba(59,130,246,0.25)",
    minWidth: 160,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryBtnDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
    filter: "grayscale(0.2)",
  },
  secondaryBtn: {
    padding: "10px 16px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "#fff",
    fontWeight: 600,
    cursor: "pointer",
  },
  greenBtn: {
    background: "#16a34a",
    color: "#fff",
    padding: "10px 16px",
    borderRadius: 10,
    border: "none",
    fontWeight: 700,
    cursor: "pointer",
    minWidth: 220,
  },
  greenBtnDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  smallRemoveBtn: {
    border: "none",
    background: "transparent",
    color: "#dc2626",
    cursor: "pointer",
    fontSize: 12,
  },
};

/* --------------------- tiny local helpers (unchanged) --------------------- */
function dedupeCaseInsensitive(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of (arr || []).map((s) => (s || "").trim()).filter(Boolean)) {
    const k = raw.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(raw);
    }
  }
  return out;
}

function parseCsvRows(text: string): Array<Record<string, string>> {
  const lines = (text || "").split(/\r?\n/).filter((l) => l.trim().length);
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
    return cells.map((c) => c.trim());
  };

  const header = split(lines[0]).map((h) => h.replace(/^"|"$/g, ""));
  const rows: Array<Record<string, string>> = [];
  for (const line of lines.slice(1)) {
    const vals = split(line);
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = (vals[i] || "").replace(/^"|"$/g, "")));
    rows.push(row);
  }
  return rows;
}

function parseCsvKeywords(text: string): string[] {
  const rows = parseCsvRows(text);
  if (!rows.length) return [];
  const key =
    Object.keys(rows[0]).find((k) =>
      /^(keyword|query|phrase)$/i.test(k.trim())
    ) || Object.keys(rows[0])[0];
  return dedupeCaseInsensitive(
    rows.map((r) => (r?.[key] || "").trim()).filter(Boolean)
  );
}

/* --------------------------- NEW: CSV export helper --------------------------- */
function downloadCsv(
  filename: string,
  rows: Array<{ Subtopic: string; Query: string }>
) {
  const header = ["Subtopic", "Query"];
  const escape = (s: string) => `"${(s || "").replace(/"/g, '""')}"`;
  const body = rows
    .map((r) => `${escape(r.Subtopic)},${escape(r.Query)}`)
    .join("\n");
  const csv = `${header.join(",")}\n${body}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function slug(s: string) {
  return (s || "fanout")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/* --------------------------- component --------------------------- */
const TopicMapperTab: React.FC = () => {
  // From Workspace (shared)
  const { apiKey, siteEmbeddings } = useWorkspace();

  // Local inputs
  const [topic, setTopic] = useState("");

  // Builder (Subtopics -> bins of queries)
  const [subtopics, setSubtopics] = useState<{ id: string; label: string }[]>(
    []
  );
  const [queriesBySubtopic, setQueriesBySubtopic] = useState<
    Record<string, string[]>
  >({});

  // Keywords CSV (optional fast path)
  const [uploadedKeywords, setUploadedKeywords] = useState<string[]>([]);

  // UI state
  const [step, setStep] = useState<
    "idle" | "fanout" | "curate" | "analyzing" | "done"
  >("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");

  // Results (panel shape)
  const [tmResults, setTmResults] = useState<{
    topic: { label: string; url?: string; score?: number };
    subtopics: Array<{ label: string; url?: string; score?: number }>;
    queries: Array<{
      label: string;
      url?: string;
      score?: number;
      subtopic?: string;
      type?: string;
      userJourneyStage?: string;
      commercialIntent?: string;
      priority?: string;
      reasoning?: string;
      contentOpportunity?: string;
    }>;
    finalScore?: number;
    analyzedPages?: number;
  } | null>(null);

  // Derived
  const curatedQueries = useMemo(
    () => Object.values(queriesBySubtopic).flat().filter(Boolean),
    [queriesBySubtopic]
  );

  const isCustomUploadOnly = subtopics.length === 0; // true when using only uploaded CSV list
  const canExportFanout = step === "curate" && subtopics.length > 0; // export only for synthetic fanout per requirements

  /* ------------------------ file handlers ------------------------ */
  const onUploadKeywords = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        const kws = parseCsvKeywords(text);
        if (!kws.length) {
          setError("No keywords found (first column).");
          setUploadedKeywords([]);
          setQueriesBySubtopic({});
          setSubtopics([]);
          setTmResults(null);
          setStep("idle");
          return;
        }
        setUploadedKeywords(kws);
        setError("");
        const subId = "custom-upload";
        setSubtopics([]); // keep no subtopics so this path is clearly "upload-only"
        setQueriesBySubtopic({ [subId]: kws });
        setTmResults(null); // clear any stale results so the curate UI shows
        setStep("curate");
      } catch {
        setError("Failed to read keyword CSV.");
        setUploadedKeywords([]);
        setQueriesBySubtopic({});
        setSubtopics([]);
        setTmResults(null);
        setStep("idle");
      }
    };
    reader.readAsText(file);
  };

  /* ------------------------ builder actions ------------------------ */
  const startFanout = async () => {
    if (!apiKey.trim())
      return setError("Add your Gemini API key in the Workspace tab.");
    if (!topic.trim()) return setError("Enter a topic.");
    setError("");
    setBusy(true);
    setStep("fanout");
    try {
      const subs = await splitIntoSubtopics(apiKey, topic);
      const deduped = dedupeCaseInsensitive(subs).slice(0, 12);
      const rows = deduped.map((label, i) => ({ id: `s${i + 1}`, label }));
      setSubtopics(rows);
      const bins: Record<string, string[]> = {};
      for (const s of rows) {
        const qs = await generateSyntheticQueries(apiKey, s.label);
        bins[s.id] = dedupeCaseInsensitive(qs);
      }
      setQueriesBySubtopic(bins);
      setTmResults(null); // ensure curate renders
      setStep("curate");
    } catch (e: any) {
      setError(e?.message || "Fan-out failed.");
      setStep("idle");
    } finally {
      setBusy(false);
    }
  };

  const addQuery = (subId: string, value: string) => {
    const v = (value || "").trim();
    if (!v) return;
    const merged = dedupeCaseInsensitive([
      ...(queriesBySubtopic[subId] || []),
      v,
    ]);
    setQueriesBySubtopic({ ...queriesBySubtopic, [subId]: merged });
  };

  const removeQuery = (subId: string, idx: number) => {
    const cur = [...(queriesBySubtopic[subId] || [])];
    cur.splice(idx, 1);
    setQueriesBySubtopic({ ...queriesBySubtopic, [subId]: cur });
  };

  const analyze = async () => {
    if (!apiKey.trim())
      return setError("Enter your Gemini API key in the Workspace tab.");
    if (!siteEmbeddings.length) {
      return setError(
        "Upload your Embeddings CSV in Workspace first. Topic Mapper reads embeddings from there."
      );
    }
    const flatQueries = Object.values(queriesBySubtopic).flat().filter(Boolean);
    if (!flatQueries.length) {
      return setError("Add at least one query before analysis.");
    }

    setError("");
    setBusy(true);
    setStep("analyzing");

    try {
      const contentEmbeds = siteEmbeddings; // [{ url, embedding }]

      // If the user bypassed the topic, still produce a sensible label
      const topicLabel =
        (topic || "").trim() ||
        (isCustomUploadOnly ? "Custom Upload" : "Untitled Topic");
      let topicRow = {
        label: topicLabel,
        url: undefined as string | undefined,
        score: 0 as number,
      };

      if ((topic || "").trim()) {
        const [topicRow0] = await tmMapNodesToContent(
          [topicLabel],
          contentEmbeds,
          apiKey
        );
        topicRow = {
          label: topicLabel,
          url: topicRow0?.url,
          score: topicRow0?.score ?? 0,
        };
      }

      const subLabels = subtopics.map((s) => s.label);
      const subRows = subLabels.length
        ? await tmMapNodesToContent(subLabels, contentEmbeds, apiKey)
        : [];

      const queryRows = await tmMapNodesToContent(
        flatQueries,
        contentEmbeds,
        apiKey
      );

      const annotated = queryRows.map((q) => {
        const hit =
          subLabels.find((sl) =>
            q.label
              .toLowerCase()
              .includes(sl.toLowerCase().slice(0, Math.min(6, sl.length)))
          ) || "";
        return { ...q, subtopic: hit };
      });

      const finalScore = tmComputeFinalScore(topicRow, subRows, annotated);

      setTmResults({
        topic: topicRow,
        subtopics: subRows,
        queries: annotated,
        finalScore,
        analyzedPages: contentEmbeds.length,
      });

      setStep("done");
    } catch (e: any) {
      setError(e?.message || "Analysis failed.");
      setStep("curate");
    } finally {
      setBusy(false);
    }
  };

  const resetAll = () => {
    setError("");
    setBusy(false);
    setStep("idle");
    setSubtopics([]);
    setQueriesBySubtopic({});
    setUploadedKeywords([]);
    setTmResults(null);
  };

  /* --------------------------- NEW: export fanout --------------------------- */
  const exportFanout = () => {
    if (!canExportFanout) return;
    const rows: Array<{ Subtopic: string; Query: string }> = [];
    for (const s of subtopics) {
      const bin = queriesBySubtopic[s.id] || [];
      for (const q of bin) rows.push({ Subtopic: s.label, Query: q });
    }
    const name = (topic.trim() ? `${slug(topic)}-` : "") + `fanout-queries.csv`;
    downloadCsv(name, rows);
  };

  /* ------------------------------ UI ------------------------------ */
  return (
    <div style={styles.page}>
      <h2 style={styles.header}>
        <Icons.Activity size={24} />
        Query Fanout & Topic Mapper
      </h2>

      <div style={styles.infoPanel}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>
          🧭 How this tab works
        </div>
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          <li style={{ marginBottom: 6 }}>
            <strong>a) Generate fanout (synthetic queries)</strong> from a main
            topic — then either <em>export that list as-is</em> (no mapping), or
            continue to mapping.
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>b) Map synthetic queries to your content</strong> to assess
            semantic coverage using your Workspace embeddings.
          </li>
          <li>
            <strong>c) Upload your own keyword list</strong> and map to content
            — bypass fanout entirely.
          </li>
        </ol>
      </div>

      {/* Topic + action row (API key comes from Workspace) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 12,
          alignItems: "center",
        }}
      >
        <input
          type="text"
          placeholder='Main topic (e.g. "programmatic SEO for marketplaces")'
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          style={styles.input}
        />
        <button
          onClick={startFanout}
          disabled={!apiKey.trim() || !topic.trim() || busy}
          style={{
            ...styles.primaryBtn,
            ...((!apiKey.trim() || !topic.trim() || busy) &&
              styles.primaryBtnDisabled),
          }}
          title={
            !apiKey.trim()
              ? "Add your Gemini API key in the Workspace tab"
              : "Generate subtopics and seed queries"
          }
        >
          {busy && step === "fanout" ? "Starting…" : "Start Fan-out"}
        </button>
      </div>

      {/* Optional: Keywords CSV (bypass fan-out) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
        <div style={{ ...styles.card, padding: 12 }}>
          <div
            style={{
              fontWeight: 700,
              marginBottom: 8,
              display: "flex",
              gap: 8,
              alignItems: "center",
              color: "#111827",
            }}
          >
            <Icons.FileText size={16} /> Upload Keywords CSV (optional)
          </div>
          <div style={styles.uploadWrap}>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => onUploadKeywords(e.target.files?.[0] || null)}
            />
          </div>
          {uploadedKeywords.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 13, color: "#065f46" }}>
              ✅ Loaded {uploadedKeywords.length.toLocaleString()} keywords into
              your working list.
            </div>
          )}
        </div>
      </div>

      {/* Errors */}
      {error && <div style={styles.errorPanel}>{error}</div>}

      {/* Curate bins */}
      {step === "curate" && (
        <>
          <div style={styles.successPanel}>
            {subtopics.length
              ? "Curate your fanout bins (add/remove queries). Then either Export Fanout as CSV, or Map to Content."
              : "You’re using a Custom Upload list. Trim if needed, then Map to Content."}
          </div>

          {/* Fanout bins OR simple list */}
          {subtopics.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              {subtopics.map((s) => {
                const bin = queriesBySubtopic[s.id] || [];
                return (
                  <div key={s.id} style={styles.card}>
                    <div style={styles.cardHeader}>
                      🌿 {s.label}{" "}
                      <span style={{ color: "#6b7280", fontWeight: 500 }}>
                        · {bin.length} queries
                      </span>
                    </div>
                    <div style={{ padding: 10 }}>
                      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                        <input
                          type="text"
                          placeholder="Add a query…"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const v = (e.currentTarget.value || "").trim();
                              if (v) addQuery(s.id, v);
                              e.currentTarget.value = "";
                            }
                          }}
                          style={styles.input}
                        />
                      </div>

                      {bin.length ? (
                        <div
                          style={{
                            border: "1px solid #f3f4f6",
                            borderRadius: 8,
                          }}
                        >
                          {bin.map((q, i) => (
                            <div
                              key={`${s.id}-${i}`}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr auto",
                                gap: 8,
                                padding: "8px 10px",
                                borderBottom:
                                  i < bin.length - 1
                                    ? "1px solid #f3f4f6"
                                    : "none",
                              }}
                            >
                              <div style={{ fontSize: 14, color: "#111827" }}>
                                {q}
                              </div>
                              <button
                                onClick={() => removeQuery(s.id, i)}
                                style={styles.smallRemoveBtn}
                              >
                                🗑 Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: "#6b7280" }}>
                          No queries yet.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // Custom upload simple list preview
            <div
              style={{
                ...styles.card,
                padding: 10,
                maxHeight: 320,
                overflowY: "auto",
              }}
            >
              {uploadedKeywords.map((q, idx) => (
                <div
                  key={`csv-${idx}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 8,
                    padding: "6px 0",
                    borderBottom: "1px dashed #f3f4f6",
                  }}
                >
                  <div style={{ fontSize: 13, color: "#374151" }}>{q}</div>
                  <button
                    onClick={() => {
                      const copy = [...uploadedKeywords];
                      copy.splice(idx, 1);
                      setUploadedKeywords(copy);
                      setQueriesBySubtopic({ ["custom-upload"]: copy });
                    }}
                    style={styles.smallRemoveBtn}
                  >
                    Remove
                  </button>
                </div>
              ))}
              {uploadedKeywords.length === 0 && (
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  No uploaded keywords.
                </div>
              )}
            </div>
          )}

          {/* Action row: Export (fanout) and/or Map to Content */}
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "center",
              marginTop: 12,
              flexWrap: "wrap",
            }}
          >
            {canExportFanout && (
              <button
                onClick={exportFanout}
                disabled={!curatedQueries.length || busy}
                style={{
                  ...styles.secondaryBtn,
                  ...(busy && { opacity: 0.6, cursor: "not-allowed" }),
                }}
                title="Download the synthetic query fanout as CSV without mapping."
              >
                ⬇️ Export Fanout (.csv)
              </button>
            )}

            <button
              onClick={analyze}
              disabled={
                busy ||
                !apiKey.trim() ||
                !Object.values(queriesBySubtopic).flat().filter(Boolean).length
              }
              style={{
                ...styles.greenBtn,
                ...((busy ||
                  !apiKey.trim() ||
                  !Object.values(queriesBySubtopic).flat().filter(Boolean)
                    .length) &&
                  styles.greenBtnDisabled),
              }}
              title="Map the queries to your content using your Workspace embeddings."
            >
              {busy && step === "analyzing" ? "Analyzing…" : "Map to Content"}
            </button>

            <button onClick={resetAll} style={styles.secondaryBtn}>
              Reset
            </button>
          </div>
        </>
      )}

      {/* analyzing */}
      {step === "analyzing" && (
        <div style={styles.infoPanel}>
          Mapping queries to your content using embeddings…
        </div>
      )}

      {/* results */}
      {step === "done" && tmResults && (
        <div style={{ marginTop: 8 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <button onClick={resetAll} style={styles.secondaryBtn}>
              Start over
            </button>
          </div>
          <TopicMapPanel tmResults={tmResults} />
        </div>
      )}

      {/* idle hint */}
      {step === "idle" && (
        <div style={styles.dashedHint}>
          Add your API key and upload an <strong>Embeddings CSV</strong> in the{" "}
          <em>Workspace</em> tab.
          <br />
          Then either:
          <br />• Enter a topic and click <strong>Start Fan-out</strong> to
          generate synthetic queries (you can export that list as CSV, or
          continue to mapping), or
          <br />• Upload a <em>Keywords CSV</em> to bypass fanout and map your
          own list.
        </div>
      )}
    </div>
  );
};

export default TopicMapperTab;
