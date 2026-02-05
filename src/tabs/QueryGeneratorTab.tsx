// src/tabs/QueryGeneratorTab.tsx
import React, { useMemo, useState } from "react";
import { useWorkspace } from "../context/WorkspaceContext";
import { dedupeCaseInsensitive, downloadCSV } from "../lib/utils";
import { makeGeminiEmbedder, cosine } from "../lib/embeddings";
import { generateJSON } from "../lib/gemini";

type Match = { url: string; score: number };
type Mapping = { query: string; matches: Match[] };

const QUERY_TYPES: Record<string, { label: string; hint?: string }> = {
  RELATED: { label: "Related" },
  IMPLICIT: { label: "Implicit need" },
  COMPARATIVE: { label: "Comparative" },
  REFORMULATION: { label: "Reformulation" },
  ENTITY_EXPANDED: { label: "Entity-expanded" },
  PERSONALIZED: { label: "Personalized" },
  RECENT: { label: "Recent" },
};

const ALL_TYPE_KEYS = Object.keys(QUERY_TYPES);

export default function QueryGeneratorTab() {
  const {
    apiKey,
    syntheticQueries = [], // safe default
    setSyntheticQueries,
    siteEmbeddings,
  } = useWorkspace();

  // Inputs
  const [target, setTarget] = useState("");
  const [contextText, setContextText] = useState("");
  const [batchSize, setBatchSize] = useState(12);

  // Type selection
  const [allTypes, setAllTypes] = useState(true);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(ALL_TYPE_KEYS);

  // Gen state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [postFilterNote, setPostFilterNote] = useState("");

  // Mapping UI state
  const [topK, setTopK] = useState(5);
  const [mapping, setMapping] = useState<Mapping[]>([]);
  const [mappingBusy, setMappingBusy] = useState(false);
  const [mappingError, setMappingError] = useState("");

  const total = syntheticQueries?.length ?? 0;

  // ----- list management -----
  const addManual = (text: string) => {
    const v = text.trim();
    if (!v) return;
    setSyntheticQueries((prev) =>
      dedupeCaseInsensitive([...prev, { query: v }], (x) => x.query)
    );
  };
  const removeAt = (idx: number) =>
    setSyntheticQueries((prev) => prev.filter((_, i) => i !== idx));
  const copyToClipboard = (q: string) => navigator.clipboard.writeText(q);

  // ----- exports -----
  const exportCSV = () => {
    const rows = [
      [
        "Query",
        "Type",
        "Priority",
        "Commercial Intent",
        "User Journey Stage",
        "Reasoning",
        "Content Opportunity",
        "Business Value",
        "AI Mode Role",
        "Trigger Condition",
      ],
      ...syntheticQueries.map((q) => [
        q.query,
        q.type || "",
        q.priority || "",
        q.commercialIntent || "",
        q.userJourneyStage || "",
        q.reasoning || "",
        q.contentOpportunity || "",
        q.businessValue || "",
        q.aiModeRole || "",
        q.triggerCondition || "",
      ]),
    ];
    downloadCSV(`synthetic-queries-${target || "nexus"}.csv`, rows);
  };

  const exportMappingsCSV = () => {
    const rows = [["Query", "URL", "Similarity"]];
    mapping.forEach((m) => {
      m.matches.forEach((mm) =>
        rows.push([m.query, mm.url, String(mm.score.toFixed(4))])
      );
    });
    downloadCSV(`query-to-content-mapping.csv`, rows);
  };

  // ----- generation -----
  const allowedTypes = allTypes
    ? ALL_TYPE_KEYS
    : selectedTypes.length
    ? selectedTypes
    : ALL_TYPE_KEYS;

  const canGenerate = !!apiKey.trim() && !!target.trim() && !loading;

  const generateFanOut = async () => {
    if (!canGenerate) return;
    setLoading(true);
    setError("");
    setPostFilterNote("");

    const existing = syntheticQueries.map((q) => `- ${q.query}`).join("\n");
    const typesList = allowedTypes.join(", ");

    const prompt = `You are generating diverse, high-signal synthetic search queries for Google's AI Mode query fan-out.

TARGET QUERY: "${target}"
ALLOWED TYPES: ${typesList}
DESIRED COUNT: ${batchSize}
OPTIONAL CONTENT CONTEXT (to sharpen intent/personalization):
${contextText || "(none)"}

RULES:
- Generate ONLY queries whose "type" is one of: ${typesList}
- No duplicates or trivial suffixes/prefixes.
- Aim for breadth across the selected types with strong intent variety.
- Avoid generic head terms; prefer realistic, high-intent long-tails when relevant.
- Do NOT repeat any of the previously generated queries below.

PREVIOUSLY GENERATED QUERIES (avoid):
${existing || "(none)"}

Return ONLY valid JSON in this exact shape:
{
  "targetQuery": "${target}",
  "totalQueries": ${batchSize},
  "syntheticQueries": [
    {
      "query": "string",
      "type": "RELATED|IMPLICIT|COMPARATIVE|REFORMULATION|ENTITY_EXPANDED|PERSONALIZED|RECENT",
      "priority": "P0|P1|P2|optional",
      "commercialIntent": "navigational|informational|transactional|commercial investigation|optional",
      "userJourneyStage": "awareness|consideration|decision|retention|optional",
      "reasoning": "why this query is valuable",
      "contentOpportunity": "what content should be created/optimized and why",
      "businessValue": "short note on expected value",
      "aiModeRole": "optional: helpful assistant role that would best respond",
      "triggerCondition": "optional: when this should be activated"
    }
  ]
}`;

    try {
      const payload = await generateJSON(apiKey, prompt, {
        temperature: 0.35,
        maxOutputTokens: 2048,
      });

      const incoming = Array.isArray(payload?.syntheticQueries)
        ? payload.syntheticQueries
        : [];

      // Defensive filtering by allowed types + shape
      const filtered = incoming.filter(
        (q: any) =>
          q?.query &&
          typeof q.query === "string" &&
          (q?.type ? allowedTypes.includes(q.type) : true)
      );

      if (filtered.length < batchSize) {
        setPostFilterNote(
          `Returned ${filtered.length}/${batchSize} after filtering by selected types.`
        );
      }

      setSyntheticQueries((prev) =>
        dedupeCaseInsensitive([...prev, ...filtered], (x) => x.query)
      );
    } catch (e: any) {
      setError(`Generation failed: ${e?.message || String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  // ----- mapping to embeddings -----
  const canMap =
    apiKey.trim() && siteEmbeddings.length > 0 && total > 0 && !mappingBusy;

  const mapToContent = async () => {
    if (!canMap) return;
    setMappingBusy(true);
    setMappingError("");

    try {
      const embed = makeGeminiEmbedder(apiKey);

      // Embed all queries (simple concurrency)
      const batches: string[][] = [];
      const B = 8; // concurrency
      for (let i = 0; i < syntheticQueries.length; i += B) {
        batches.push(syntheticQueries.slice(i, i + B).map((q) => q.query));
      }

      const allEmbeds: number[][] = [];
      for (const batch of batches) {
        const results = await Promise.allSettled(batch.map((q) => embed(q)));
        results.forEach((r) => {
          if (r.status === "fulfilled") allEmbeds.push(r.value);
          else allEmbeds.push([]); // keep index alignment
        });
      }

      const mapped: Mapping[] = syntheticQueries.map((q, i) => {
        const qv = allEmbeds[i] || [];
        const scored: Match[] = siteEmbeddings
          .map((row) => ({
            url: row.url,
            score: qv.length ? cosine(qv, row.embedding || []) : 0,
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, topK);
        return { query: q.query, matches: scored };
      });

      setMapping(mapped);
    } catch (e: any) {
      setMappingError(`Mapping failed: ${e?.message || String(e)}`);
    } finally {
      setMappingBusy(false);
    }
  };

  // ----- header note -----
  const headerNote = useMemo(() => {
    if (!apiKey) return "Add your Gemini API key in the Workspace tab.";
    if (!target) return "Enter a target query to get started.";
    return "";
  }, [apiKey, target]);

  // ----- chip styles -----
  const chipStyle = (active: boolean): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 12px",
    marginRight: 8,
    marginBottom: 8,
    borderRadius: 999,
    border: active ? "1px solid rgba(29,78,216,0.35)" : "1px solid #e5e7eb",
    background: active
      ? "linear-gradient(135deg, rgba(59,130,246,.15), rgba(29,78,216,.25))"
      : "linear-gradient(135deg, #f9fafb, #f3f4f6)",
    color: active ? "#1e3a8a" : "#374151",
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
    userSelect: "none",
    transition: "transform .06s ease, box-shadow .1s ease",
    boxShadow: active
      ? "0 3px 10px rgba(29,78,216,0.12)"
      : "0 1px 3px rgba(0,0,0,0.04)",
  });

  const chipHoverStyle: React.CSSProperties = {
    transform: "translateY(-1px)",
  };

  // ----- UI helpers (fixed behavior) -----
  const toggleAllTypes = (next: boolean) => {
    setAllTypes(next);
    // keep everything selected either way, user can customize after turning off
    setSelectedTypes(ALL_TYPE_KEYS);
  };

  const toggleType = (t: string) => {
    // If "All types" is on, clicking a chip switches to custom mode and toggles that chip
    if (allTypes) {
      setAllTypes(false);
      setSelectedTypes((prev) => {
        const base = new Set(ALL_TYPE_KEYS);
        if (base.has(t)) base.delete(t);
        else base.add(t);
        return Array.from(base);
      });
      return;
    }

    // Normal toggle
    setSelectedTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>🔎 Synthetic Query Generation</h2>
        <div className="subtext">
          No duplicates. Shared across tabs. Map to your uploaded embeddings
          with one click.
        </div>
      </div>

      {/* Inputs */}
      <div className="grid-2">
        <div className="card card-orange">
          <label className="label">🎯 Target Query *</label>
          <input
            className="input"
            placeholder='e.g., "best marketing automation platform"'
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />

          <div className="row mt-8">
            <label className="label-sm">Batch size</label>
            <input
              type="number"
              min={4}
              max={50}
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value || 12))}
              className="input small"
              style={{ width: 90 }}
            />
          </div>

          {/* Types */}
          <div className="mt-12">
            <label className="label-sm">Types</label>
            <div className="row wrap mt-6">
              {/* All types master toggle */}
              <button
                className="chip"
                onClick={() => toggleAllTypes(!allTypes)}
                title="Select or lock all types"
                style={chipStyle(allTypes)}
                onMouseEnter={(e) =>
                  Object.assign(
                    (e.currentTarget as HTMLButtonElement).style,
                    chipHoverStyle
                  )
                }
                onMouseLeave={(e) =>
                  Object.assign(
                    (e.currentTarget as HTMLButtonElement).style,
                    {}
                  )
                }
              >
                All types
              </button>

              {/* Individual types (always clickable; clicking while All types=ON turns it off) */}
              {ALL_TYPE_KEYS.map((t) => {
                const active = selectedTypes.includes(t);
                return (
                  <button
                    key={t}
                    className="chip"
                    aria-pressed={active}
                    onClick={() => toggleType(t)}
                    title={
                      allTypes
                        ? "Click to customize types (All types will turn off)"
                        : QUERY_TYPES[t]?.label
                    }
                    style={{ ...chipStyle(active), textTransform: "none" }}
                    onMouseEnter={(e) =>
                      Object.assign(
                        (e.currentTarget as HTMLButtonElement).style,
                        chipHoverStyle
                      )
                    }
                    onMouseLeave={(e) =>
                      Object.assign(
                        (e.currentTarget as HTMLButtonElement).style,
                        {}
                      )
                    }
                  >
                    {QUERY_TYPES[t]?.label || t}
                  </button>
                );
              })}
            </div>
            {!allTypes && selectedTypes.length === 0 && (
              <div className="tip mt-8">
                Choose at least one type or enable “All types”.
              </div>
            )}
          </div>
        </div>

        <div className="card card-green">
          <label className="label">🧩 Content Context (Optional)</label>
          <textarea
            className="textarea"
            rows={5}
            placeholder="Describe audience, product, persona…"
            value={contextText}
            onChange={(e) => setContextText(e.target.value)}
          />
          <div className="tip">
            Tip: add persona or vertical to guide personalization.
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="center mt-16">
        <button
          className={`btn primary ${
            !canGenerate || (!allTypes && selectedTypes.length === 0)
              ? "disabled"
              : ""
          }`}
          onClick={generateFanOut}
          disabled={!canGenerate || (!allTypes && selectedTypes.length === 0)}
        >
          {loading ? "Generating…" : "Generate Queries"}
        </button>
        <button
          className="btn ghost ml-8"
          onClick={exportCSV}
          disabled={!total}
        >
          ⬇️ Export CSV
        </button>
      </div>

      {headerNote && <div className="note mt-12">{headerNote}</div>}
      {error && <div className="alert mt-12">⚠️ {error}</div>}
      {postFilterNote && !error && (
        <div className="note mt-12">{postFilterNote}</div>
      )}

      {/* Manual add */}
      <div className="card mt-20">
        <div className="row">
          <input
            className="input"
            placeholder="Add a custom query and press Enter…"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const v = (e.currentTarget.value || "").trim();
                if (v) addManual(v);
                e.currentTarget.value = "";
              }
            }}
          />
          <button
            className="btn"
            onClick={() => {
              const el = document.querySelector<HTMLInputElement>(
                'input[placeholder^="Add a custom"]'
              );
              if (el?.value) {
                addManual(el.value);
                el.value = "";
              }
            }}
          >
            Add
          </button>
          <div className="spacer" />
          <div className="row">
            <label className="label-sm mr-8">Top K</label>
            <input
              type="number"
              min={1}
              max={20}
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value || 5))}
              className="input small"
              style={{ width: 70 }}
            />
            <button
              className={`btn ml-8 ${!canMap ? "disabled" : ""}`}
              onClick={mapToContent}
              disabled={!canMap}
              title={
                siteEmbeddings.length
                  ? ""
                  : "Upload embeddings in Workspace first"
              }
            >
              {mappingBusy ? "Mapping…" : "🔗 Map to Content"}
            </button>
            <button
              className="btn ghost ml-8"
              onClick={exportMappingsCSV}
              disabled={!mapping.length}
            >
              ⬇️ Export Mappings
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="card mt-12">
        <div className="row between">
          <div className="label">Results</div>
          <div className="muted">{total} queries</div>
        </div>

        {!total ? (
          <div className="empty">No queries yet.</div>
        ) : (
          <div className="list">
            {syntheticQueries.map((q, i) => {
              const t = q.type && (QUERY_TYPES[q.type]?.label || q.type);
              const m = mapping.find((mm) => mm.query === q.query);
              return (
                <div key={`${q.query}-${i}`} className="list-row column">
                  <div className="row between">
                    <div
                      className="query"
                      onClick={() => copyToClipboard(q.query)}
                      title="Click to copy"
                    >
                      {q.query}
                    </div>
                    <div className="chips">
                      {t && <span className="chip">{t}</span>}
                      {q.priority && (
                        <span className="chip warn">{q.priority}</span>
                      )}
                      <button
                        className="link-btn ml-8"
                        onClick={() => removeAt(i)}
                        title="Remove"
                      >
                        🗑
                      </button>
                    </div>
                  </div>

                  {/* Per-query matches (if mapped) */}
                  {m && m.matches.length > 0 && (
                    <div className="matches">
                      {m.matches.map((mm, j) => (
                        <a
                          key={j}
                          href={mm.url}
                          target="_blank"
                          rel="noreferrer"
                          className="match-pill"
                        >
                          {j + 1}. {mm.url}{" "}
                          <span className="muted">({mm.score.toFixed(3)})</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {mappingError && <div className="alert mt-12">⚠️ {mappingError}</div>}
    </div>
  );
}
