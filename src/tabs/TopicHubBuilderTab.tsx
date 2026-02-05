import React, { useState, useMemo } from "react";
import { useWorkspace } from "../context/WorkspaceContext";
import { embedText } from "../lib/gemini";
import {
  cosineSimilarity,
  calculateGlobalCentroid,
  EmbeddingRow,
} from "../lib/expertiseMetrics";
import {
  Layers,
  Download,
  Search,
  CheckCircle2,
  Trash2,
  Check,
  PlusCircle,
  Zap,
  Sparkles,
  Filter,
  MinusCircle,
  X,
  Target,
  ShieldAlert,
  Database,
  Activity,
  ListFilter,
} from "lucide-react";

/* --- Styles (Unchanged) --- */
const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: 24,
    maxWidth: 1200,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  header: {
    fontSize: 26,
    fontWeight: 800,
    color: "#111827",
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  controlBar: {
    background: "#fff",
    padding: 24,
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    position: "relative",
  },
  input: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    fontSize: 15,
    width: "100%",
  },
  select: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    fontSize: 14,
    width: "100%",
    background: "#f9fafb",
    cursor: "pointer",
  },
  btn: {
    background: "linear-gradient(135deg, #ea580c 0%, #c2410c 100%)",
    color: "#fff",
    padding: "12px 24px",
    border: "none",
    borderRadius: 8,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  btnSmall: {
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    border: "1px solid #e2e8f0",
    background: "#fff",
    color: "#64748b",
  },
  btnAction: (active: boolean, color: string) => ({
    padding: "4px 12px",
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
  statCard: {
    padding: 16,
    borderRadius: 10,
    border: "1px solid #f1f5f9",
    textAlign: "center",
    flex: 1,
  },
  badge: (bg: string, fg: string) => ({
    fontSize: 10,
    fontWeight: 800,
    padding: "2px 8px",
    borderRadius: 99,
    background: bg,
    color: fg,
  }),
  tableWrap: {
    marginTop: 12,
    maxHeight: 500,
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
    padding: "12px 16px",
    fontSize: 13,
    borderBottom: "1px solid #f1f5f9",
    color: "#334155",
  },
  searchDropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    zIndex: 100,
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
    maxHeight: 300,
    overflowY: "auto",
    marginTop: 4,
  },
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
    zIndex: 10,
  },
  chip: {
    background: "#10b981",
    color: "#fff",
    padding: "6px 12px",
    borderRadius: 20,
    fontSize: 11,
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontWeight: 600,
  },
  enrichmentBox: {
    background: "#1e293b",
    color: "#fff",
    padding: 20,
    borderRadius: 12,
    border: "1px solid #334155",
  },
};

/* --- Helpers --- */
const parseEmbed = (t: string) =>
  t
    .replace(/[\[\]\s]/g, "")
    .split(",")
    .map(Number);
const getBlogCategory = (url: string) => {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    if (segments.length > 0)
      return segments[0].charAt(0).toUpperCase() + segments[0].slice(1);
  } catch (e) {}
  return "General";
};

export default function MasterHubBuilderTab() {
  const { siteEmbeddings, apiKey } = useWorkspace();

  // Core State
  const [topicName, setTopicName] = useState("");
  const [threshold, setThreshold] = useState(0.65);
  const [baseline, setBaseline] = useState<any[]>([]);
  const [samples, setSamples] = useState<EmbeddingRow[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<EmbeddingRow[]>([]);
  const [currentCentroid, setCurrentCentroid] = useState<number[] | null>(null);

  // Filter Guardrail State
  const [mustInclude, setMustInclude] = useState("");
  const [mustExclude, setMustExclude] = useState("");

  // Results & UI State
  const [results, setResults] = useState<any[]>([]);
  const [curatedUrls, setCuratedUrls] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [ran, setRan] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchSample, setSearchSample] = useState("");
  const [isBaselineListOpen, setIsBaselineListOpen] = useState(false);

  /* --- Logic: Baseline --- */
  const handleBaselineUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const lines = (event.target?.result as string)
        .split(/\r?\n/)
        .filter((l) => l.trim());
      const header = lines[0]
        .split(",")
        .map((h) => h.trim().replace(/^"|"$/g, ""));
      const urlIdx = header.findIndex((h) => /url|address/i.test(h));
      const embedIdx = header.findIndex((h) => /embedding/i.test(h));
      const scoreIdx = header.findIndex((h) => /score|semantic/i.test(h));

      const mapped = lines
        .slice(1)
        .map((l) => {
          const parts = l.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
          const url = parts[urlIdx]?.replace(/^"|"$/g, "");
          const embedText = parts[embedIdx]?.replace(/^"|"$/g, "");
          const score = scoreIdx !== -1 ? parseFloat(parts[scoreIdx]) : 0;
          return {
            url,
            embedding: embedText ? parseEmbed(embedText) : [],
            score,
          };
        })
        .filter((r) => r.url && r.embedding.length > 0);

      setBaseline(mapped);
      updateAiSuggestions(samples, mapped);
    };
    reader.readAsText(file);
  };

  /* --- Logic: Exemplars --- */
  const updateAiSuggestions = (
    manual: EmbeddingRow[],
    currentBaseline: EmbeddingRow[]
  ) => {
    const pool = [...manual, ...currentBaseline];
    if (pool.length < 1) return setAiSuggestions([]);
    const centroid = calculateGlobalCentroid(pool);
    const existing = new Set(pool.map((p) => p.url));
    const recs = siteEmbeddings
      .filter((e) => !existing.has(e.url))
      .map((e) => ({ ...e, score: cosineSimilarity(centroid, e.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    setAiSuggestions(recs as any);
  };

  const toggleSample = (page: EmbeddingRow) => {
    const isSelected = samples.find((s) => s.url === page.url);
    const next = isSelected
      ? samples.filter((s) => s.url !== page.url)
      : [...samples, page];
    setSamples(next);
    updateAiSuggestions(next, baseline);
  };

  // Logic FIX: Handle Select All for Baseline
  const handleSelectAllBaseline = () => {
    const baselineUrls = new Set(baseline.map((b) => b.url));
    const selectedBaselineCount = samples.filter((s) =>
      baselineUrls.has(s.url)
    ).length;

    let next;
    if (selectedBaselineCount === baseline.length) {
      // All selected: Remove baseline items from samples (keep manually searched ones)
      next = samples.filter((s) => !baselineUrls.has(s.url));
    } else {
      // Not all selected: Add missing baseline items
      const currentSampleUrls = new Set(samples.map((s) => s.url));
      const missingFromBaseline = baseline.filter(
        (b) => !currentSampleUrls.has(b.url)
      );
      next = [...samples, ...missingFromBaseline];
    }
    setSamples(next);
    updateAiSuggestions(next, baseline);
  };

  /* --- Logic: Generate Hub --- */
  const handleGenerateHub = async () => {
    if (!apiKey || !topicName) return alert("Enter Topic Name and API Key.");
    setIsScanning(true);
    try {
      const promptVector = await embedText(apiKey, topicName);
      const allVectors = [promptVector, ...samples.map((s) => s.embedding)];
      const centroid = calculateGlobalCentroid(
        allVectors.map((v) => ({ url: "", embedding: v }))
      );
      setCurrentCentroid(centroid);
      const matches = siteEmbeddings
        .map((e) => ({ ...e, score: cosineSimilarity(centroid, e.embedding) }))
        .filter((m) => m.score >= threshold)
        .sort((a, b) => b.score - a.score);
      setResults(matches);
      setCuratedUrls(new Set(matches.map((m) => m.url)));
      setRan(true);
    } catch (e) {
      alert("Scan failed.");
    } finally {
      setIsScanning(false);
    }
  };

  const filteredResults = useMemo(() => {
    return results.filter((r) => {
      const inc = mustInclude
        ? r.url.toLowerCase().includes(mustInclude.toLowerCase())
        : true;
      const exc = mustExclude
        ? !r.url.toLowerCase().includes(mustExclude.toLowerCase())
        : true;
      return inc && exc;
    });
  }, [results, mustInclude, mustExclude]);

  const audit = useMemo(() => {
    if (!ran) return null;
    const baseUrls = new Set(baseline.map((p) => p.url));
    return {
      alreadyTagged: filteredResults.filter((r) => baseUrls.has(r.url)),
      newDiscoveries: filteredResults.filter((r) => !baseUrls.has(r.url)),
      dropped: baseline.filter(
        (b) => !new Set(filteredResults.map((r) => r.url)).has(b.url)
      ),
    };
  }, [ran, filteredResults, baseline]);

  const curationList = useMemo(() => {
    const list = [...filteredResults, ...(audit?.dropped || [])];
    return list.filter((p) =>
      p.url.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [filteredResults, audit, searchTerm]);

  const handleExport = () => {
    const exportData = Array.from(curatedUrls)
      .filter((url) => {
        const inc = mustInclude
          ? url.toLowerCase().includes(mustInclude.toLowerCase())
          : true;
        const exc = mustExclude
          ? !url.toLowerCase().includes(mustExclude.toLowerCase())
          : true;
        return inc && exc;
      })
      .map((url, i) => {
        const match =
          results.find((r) => r.url === url) ||
          baseline.find((b) => b.url === url) ||
          siteEmbeddings.find((s) => s.url === url);
        let finalScore = match?.score;
        if (
          (finalScore === undefined || isNaN(finalScore) || finalScore === 0) &&
          currentCentroid &&
          match?.embedding
        ) {
          finalScore = cosineSimilarity(currentCentroid, match.embedding);
        }
        return [
          `"${url}"`,
          (finalScore || 0).toFixed(4),
          `"${getBlogCategory(url)}"`,
          i === 0 ? '"Pillar Candidate"' : '"Cluster Content"',
          `"${match?.embedding.join(",")}"`,
        ];
      });
    const csvContent = [
      ["TOPIC HUB REPORT", `"${topicName}"`],
      [],
      ["URL", "Semantic Score", "Blog", "Role", "Embedding"],
      ...exportData,
    ]
      .map((r) => r.join(","))
      .join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csvContent]));
    link.download = `Master_Hub_${topicName.replace(/\s+/g, "_")}.csv`;
    link.click();
  };

  return (
    <div style={styles.page}>
      <h2 style={styles.header}>
        <Layers color="#ea580c" /> Nexus: Master Hub Builder
      </h2>

      {/* STEP 1: Setup */}
      <div style={styles.controlBar}>
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: 2 }}>
            <label style={{ fontSize: 11, fontWeight: 800, color: "#64748b" }}>
              STEP 1: HUB NAME
            </label>
            <input
              style={styles.input}
              value={topicName}
              onChange={(e) => setTopicName(e.target.value)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 800, color: "#64748b" }}>
              STEP 2: UPLOAD BASELINE
            </label>
            <input
              type="file"
              style={{ fontSize: 11, marginTop: 8 }}
              onChange={handleBaselineUpload}
            />
          </div>
        </div>
      </div>

      <div style={styles.enrichmentBox}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <h4
            style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}
          >
            <Database size={18} color="#ea580c" /> Vector Strategy Enrichment
          </h4>
          <span
            style={{
              fontSize: 10,
              background: "#334155",
              padding: "4px 8px",
              borderRadius: 4,
              color: "#94a3b8",
            }}
          >
            CURRENT CENTROID STRENGTH
          </span>
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          <div
            style={{
              flex: 1,
              borderRight: "1px solid #334155",
              paddingRight: 20,
            }}
          >
            <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 4 }}>
              TOPIC INTENT (PROMPT)
            </div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {topicName || "No Topic Set"}
            </div>
            <div
              style={{
                height: 4,
                background: topicName ? "#ea580c" : "#334155",
                marginTop: 8,
                borderRadius: 2,
              }}
            />
          </div>
          <div
            style={{
              flex: 1,
              borderRight: "1px solid #334155",
              paddingRight: 20,
            }}
          >
            <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 4 }}>
              CONTEXTUAL EXEMPLARS
            </div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {samples.length} Selection(s)
            </div>
            <div
              style={{
                height: 4,
                background: samples.length > 0 ? "#10b981" : "#334155",
                marginTop: 8,
                borderRadius: 2,
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 4 }}>
              URL SET UPLOADED
            </div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {baseline.length > 0
                ? `${baseline.length} Paths - Ready`
                : "No Baseline"}
            </div>
            <div
              style={{
                height: 4,
                background: baseline.length > 0 ? "#3b82f6" : "#334155",
                marginTop: 8,
                borderRadius: 2,
              }}
            />
          </div>
        </div>
      </div>

      {/* STEP 3: Exemplars with UI FIX */}
      <div style={styles.controlBar}>
        <label style={{ fontSize: 11, fontWeight: 800, color: "#64748b" }}>
          STEP 3: BUILD EXEMPLAR LIBRARY
        </label>
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <div
              style={{
                ...styles.select,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
              onClick={() =>
                baseline.length > 0 &&
                setIsBaselineListOpen(!isBaselineListOpen)
              }
            >
              <span>
                {isBaselineListOpen
                  ? "Click to Close Baseline List"
                  : "A) Pick from Baseline..."}
              </span>
              <Filter size={14} color="#94a3b8" />
            </div>
            {isBaselineListOpen && baseline.length > 0 && (
              <div style={styles.searchDropdown}>
                {/* UI FIX: Added "Select All" Option */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectAllBaseline();
                  }}
                  style={{
                    padding: "10px 12px",
                    fontSize: 11,
                    fontWeight: 800,
                    borderBottom: "2px solid #f1f5f9",
                    color: "#2563eb",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: "#f8fafc",
                  }}
                >
                  <ListFilter size={14} />
                  {samples.filter((s) => baseline.some((b) => b.url === s.url))
                    .length === baseline.length
                    ? "Deselect All Baseline"
                    : "Select All from Baseline"}
                </div>
                {baseline.map((b) => (
                  <div
                    key={b.url}
                    onClick={() => toggleSample(b)}
                    style={{
                      padding: "10px 12px",
                      fontSize: 12,
                      cursor: "pointer",
                      borderBottom: "1px solid #f1f5f9",
                      display: "flex",
                      justifyContent: "space-between",
                      background: samples.some((s) => s.url === b.url)
                        ? "#ecfdf5"
                        : "#fff",
                    }}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {samples.some((s) => s.url === b.url) ? "✓ " : ""}
                      {b.url.split("/").pop()}
                    </span>
                    {samples.some((s) => s.url === b.url) && (
                      <Check size={14} color="#10b981" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ flex: 1, position: "relative" }}>
            <div
              style={{
                ...styles.input,
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "#fff",
              }}
            >
              <Search size={14} color="#94a3b8" />
              <input
                style={{ border: "none", outline: "none", width: "100%" }}
                placeholder="B) Search site library..."
                value={searchSample}
                onChange={(e) => setSearchSample(e.target.value)}
              />
            </div>
            {searchSample.length > 2 && (
              <div style={styles.searchDropdown}>
                {siteEmbeddings
                  .filter((e) =>
                    e.url.toLowerCase().includes(searchSample.toLowerCase())
                  )
                  .slice(0, 15)
                  .map((e) => (
                    <div
                      key={e.url}
                      onClick={() => toggleSample(e)}
                      style={{
                        padding: "10px 12px",
                        fontSize: 12,
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        background: samples.some((s) => s.url === e.url)
                          ? "#ecfdf5"
                          : "#fff",
                      }}
                    >
                      <span>{e.url}</span>
                      {samples.some((s) => s.url === e.url) && (
                        <Check size={14} color="#10b981" />
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
        {samples.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              padding: 12,
              background: "#f8fafc",
              borderRadius: 8,
            }}
          >
            {samples.map((s) => (
              <div key={s.url} style={styles.chip}>
                <Target size={12} /> {s.url.split("/").pop()}
                <X
                  size={14}
                  style={{ cursor: "pointer" }}
                  onClick={() => toggleSample(s)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* STEP 4: Guardrails */}
      <div
        style={{
          ...styles.controlBar,
          background: "#f8fafc",
          border: "1px dashed #cbd5e1",
        }}
      >
        <label
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: "#475569",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <ShieldAlert size={14} /> STEP 4: URL GUARDRAILS
        </label>
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b" }}>
              MUST INCLUDE
            </label>
            <input
              style={{ ...styles.input, background: "#fff" }}
              placeholder="e.g. /website/"
              value={mustInclude}
              onChange={(e) => setMustInclude(e.target.value)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b" }}>
              MUST EXCLUDE
            </label>
            <input
              style={{ ...styles.input, background: "#fff" }}
              placeholder="e.g. plugin"
              value={mustExclude}
              onChange={(e) => setMustExclude(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div
        style={{
          ...styles.controlBar,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <label style={{ fontWeight: 800, fontSize: 11 }}>THRESHOLD:</label>
          <input
            type="number"
            step="0.01"
            style={{ ...styles.input, width: 80 }}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
        </div>
        <button
          style={styles.btn}
          onClick={handleGenerateHub}
          disabled={isScanning}
        >
          {isScanning ? "Processing..." : "Generate Hub Strategy"}
        </button>
      </div>

      {audit && (
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ ...styles.statCard, background: "#ecfdf5" }}>
            <CheckCircle2 size={18} color="#10b981" />
            <div style={{ fontSize: 10, fontWeight: 700 }}>ALREADY TAGGED</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>
              {audit.alreadyTagged.length}
            </div>
          </div>
          <div style={{ ...styles.statCard, background: "#eff6ff" }}>
            <PlusCircle size={18} color="#3b82f6" />
            <div style={{ fontSize: 10, fontWeight: 700 }}>NEW DISCOVERIES</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>
              {audit.newDiscoveries.length}
            </div>
          </div>
          <div style={{ ...styles.statCard, background: "#fef2f2" }}>
            <MinusCircle size={18} color="#ef4444" />
            <div style={{ fontSize: 10, fontWeight: 700 }}>DROPPED</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>
              {audit.dropped.length}
            </div>
          </div>
        </div>
      )}

      {ran && (
        <div
          style={{
            background: "#fff",
            padding: 24,
            borderRadius: 12,
            border: "1px solid #e2e8f0",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <input
              style={{ ...styles.input, width: 250 }}
              placeholder="Filter results..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                style={styles.btnSmall}
                onClick={() =>
                  setCuratedUrls(
                    new Set([
                      ...Array.from(curatedUrls),
                      ...curationList.map((p) => p.url),
                    ])
                  )
                }
              >
                Select All
              </button>
              <button
                style={styles.btnSmall}
                onClick={() => {
                  const n = new Set(curatedUrls);
                  curationList.forEach((p) => n.delete(p.url));
                  setCuratedUrls(n);
                }}
              >
                Deselect All
              </button>
            </div>
          </div>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>URL</th>
                  <th style={styles.th}>BLOG</th>
                  <th style={styles.th}>STATUS</th>
                  <th style={styles.th}>SCORE</th>
                  <th style={styles.th}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {curationList.map((p) => {
                  const isAlreadyTagged = audit?.alreadyTagged.some(
                    (x) => x.url === p.url
                  );
                  const isNewDiscovery = audit?.newDiscoveries.some(
                    (x) => x.url === p.url
                  );
                  const isDropped = audit?.dropped.some((x) => x.url === p.url);
                  let scoreDisplay = p.score;
                  if (
                    (scoreDisplay === undefined ||
                      isNaN(scoreDisplay) ||
                      scoreDisplay === 0) &&
                    currentCentroid &&
                    p.embedding
                  ) {
                    scoreDisplay = cosineSimilarity(
                      currentCentroid,
                      p.embedding
                    );
                  }
                  return (
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
                        <span style={styles.badge("#f1f5f9", "#475569")}>
                          {getBlogCategory(p.url)}
                        </span>
                      </td>
                      <td style={styles.td}>
                        {isAlreadyTagged && (
                          <span style={styles.badge("#ecfdf5", "#059669")}>
                            TAGGED
                          </span>
                        )}
                        {isNewDiscovery && (
                          <span style={styles.badge("#eff6ff", "#1d4ed8")}>
                            NEW
                          </span>
                        )}
                        {isDropped && (
                          <span style={styles.badge("#fef2f2", "#dc2626")}>
                            DROPPED
                          </span>
                        )}
                      </td>
                      <td style={styles.td}>
                        {scoreDisplay?.toFixed(4) || "0.0000"}
                      </td>
                      <td style={styles.td}>
                        <button
                          onClick={() => {
                            const n = new Set(curatedUrls);
                            n.has(p.url) ? n.delete(p.url) : n.add(p.url);
                            setCuratedUrls(n);
                          }}
                          style={styles.btnAction(
                            curatedUrls.has(p.url),
                            "#10b981"
                          )}
                        >
                          {curatedUrls.has(p.url) ? (
                            <Check size={12} />
                          ) : (
                            <Trash2 size={12} />
                          )}{" "}
                          {curatedUrls.has(p.url) ? "Keep" : "Remove"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {curatedUrls.size > 0 && (
        <div style={styles.exportPanel}>
          <div>
            <div style={{ fontWeight: 700 }}>Strategy Ready</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              {curatedUrls.size} pages.
            </div>
          </div>
          <button
            onClick={handleExport}
            style={{
              background: "#10b981",
              color: "#fff",
              padding: "10px 20px",
              borderRadius: 8,
              fontWeight: 800,
              border: "none",
              cursor: "pointer",
            }}
          >
            <Download size={18} /> Export Master Cluster
          </button>
        </div>
      )}
    </div>
  );
}
