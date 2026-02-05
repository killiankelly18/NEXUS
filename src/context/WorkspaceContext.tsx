// src/context/WorkspaceContext.tsx
import React, { createContext, useContext, useMemo, useState } from "react";

/* --------------------------------- Types --------------------------------- */

export type Row = Record<string, any>;

export type SyntheticQuery = {
  query: string;
  type?: string;
  priority?: string;
  commercialIntent?: string;
  userJourneyStage?: string;
  reasoning?: string;
  contentOpportunity?: string;
  businessValue?: string;
  aiModeRole?: string;
  triggerCondition?: string;
};

export type SiteEmbedding = {
  url: string;
  embedding: number[];
};

export type WorkspaceState = {
  projectName: string;
  apiKey: string;

  // CSVs loaded into the Workspace
  queriesCsv: Row[];
  embeddingsCsv: Row[];
  authorityCsv: Row[];
  queryBacklinkCsv: Row[];

  // Legacy / primary store for generated queries
  syntheticQueries: SyntheticQuery[];

  // NEW: explicit store for the latest "Query Generator" output
  generatorKeywords: SyntheticQuery[];

  // Embeddings & results from other modules
  siteEmbeddings: SiteEmbedding[];
  tmResults: Row[];
};

type WorkspaceCtx = {
  state: WorkspaceState;
  setState: React.Dispatch<React.SetStateAction<WorkspaceState>>;

  apiKey: string;

  // Accessors
  syntheticQueries: SyntheticQuery[]; // kept in sync
  generatorKeywords: SyntheticQuery[]; // preferred for Passage Lab
  siteEmbeddings: SiteEmbedding[];

  // Mutators
  setApiKey: (k: string) => void;

  /** Legacy setter; also updates generatorKeywords to keep both in sync. */
  setSyntheticQueries: (
    next: SyntheticQuery[] | ((prev: SyntheticQuery[]) => SyntheticQuery[])
  ) => void;

  /** Preferred setter from Query Generator; also syncs syntheticQueries. */
  setGeneratorKeywords: (
    next: SyntheticQuery[] | ((prev: SyntheticQuery[]) => SyntheticQuery[])
  ) => void;

  setSiteEmbeddings: (
    next: SiteEmbedding[] | ((prev: SiteEmbedding[]) => SiteEmbedding[])
  ) => void;

  // CSV helpers
  loadCsvInto: (key: keyof WorkspaceState, rows: Row[]) => void;
  clearCsv: (key: "queriesCsv" | "embeddingsCsv" | "authorityCsv") => void;

  // Tiny cross-tab helper (dispatches a window event listened to by App)
  navigate: (tab: string, detail?: Record<string, any>) => void;

  // Convenience: publish keywords + jump straight to Passage Lab (auto-import)
  pushKeywordsToPassageLab: (
    rows: SyntheticQuery[],
    opts?: { autoImport?: boolean }
  ) => void;

  /** 🔌 Exposed embedder used by the Testing tab’s “Vectorize Missing” */
  embedTextBatch?: (texts: string[]) => Promise<number[][]>;
};

/* ------------------------------- Defaults -------------------------------- */

const defaultState: WorkspaceState = {
  projectName: "My Project",
  apiKey: "",

  queriesCsv: [],
  embeddingsCsv: [],
  authorityCsv: [],
  queryBacklinkCsv: [],

  syntheticQueries: [],
  generatorKeywords: [],

  siteEmbeddings: [],
  tmResults: [],
};

/* ------------------------------- Helpers --------------------------------- */

/** Deduplicate by (query + type + userJourneyStage) where present. */
function dedupeSyntheticQueries(rows: SyntheticQuery[]): SyntheticQuery[] {
  const keyOf = (r: SyntheticQuery) =>
    `${(r.query || "").trim().toLowerCase()}|${(r.type || "")
      .trim()
      .toLowerCase()}|${(r.userJourneyStage || "").trim().toLowerCase()}`;

  const seen = new Map<string, SyntheticQuery>();
  const richness = (o: any) =>
    Object.values(o || {}).filter(
      (v) => v !== undefined && v !== null && String(v).trim().length > 0
    ).length;

  for (const r of rows || []) {
    const k = keyOf(r);
    if (!k) continue;
    if (!seen.has(k)) {
      seen.set(k, r);
    } else {
      const prev = seen.get(k)!;
      // Keep the richer row (more metadata fields filled)
      if (richness(r) > richness(prev)) seen.set(k, r);
    }
  }
  return Array.from(seen.values());
}

/* ----------------------- Gemini embedding helpers ------------------------ */
/**
 * Tries the batch endpoint first, then falls back to single calls.
 * NOTE: If you call Gemini directly from the browser, you may need a proxy to avoid CORS.
 */
async function geminiEmbedBatch(
  texts: string[],
  apiKey: string
): Promise<number[][]> {
  if (!texts.length) return [];
  const base =
    "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004";

  // --- Try batch endpoint ---
  try {
    const r = await fetch(
      `${base}:batchEmbedContents?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: texts.map((t) => ({
            model: "models/text-embedding-004",
            content: { parts: [{ text: t }] },
          })),
        }),
      }
    );
    if (!r.ok) throw new Error(`Batch embed HTTP ${r.status}`);
    const data = await r.json();
    const vecs = (data?.embeddings ?? []).map(
      (e: any) =>
        e?.values || e?.value || e?.embedding?.values || e?.embedding?.value
    );
    if (!Array.isArray(vecs) || vecs.some((v) => !Array.isArray(v))) {
      throw new Error("Unexpected batch response shape");
    }
    return vecs as number[][];
  } catch (e) {
    // continue to single-call fallback
    console.warn("Batch embedding failed; falling back to single requests.", e);
  }

  // --- Fallback: single calls ---
  const results: number[][] = [];
  for (const t of texts) {
    const r = await fetch(
      `${base}:embedContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/text-embedding-004",
          content: { parts: [{ text: t }] },
        }),
      }
    );
    if (!r.ok) throw new Error(`Single embed HTTP ${r.status}`);
    const data = await r.json();
    const vec =
      data?.embedding?.values ||
      data?.embedding?.value ||
      data?.values ||
      data?.value;
    if (!Array.isArray(vec))
      throw new Error("Unexpected single response shape");
    results.push(vec);
  }
  return results;
}

/* -------------------------------- Context -------------------------------- */

const Context = createContext<WorkspaceCtx | null>(null);

export const WorkspaceProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [state, setState] = useState<WorkspaceState>(defaultState);

  /* ----------------------------- CSV helpers ----------------------------- */
  const loadCsvInto = (key: keyof WorkspaceState, rows: Row[]) => {
    setState((s) => ({ ...s, [key]: rows }));
  };

  const clearCsv = (
    key: "queriesCsv" | "embeddingsCsv" | "authorityCsv" | "queryBacklinkCsv"
  ) => {
    setState((s) => ({
      ...s,
      [key]: [],
      ...(key === "embeddingsCsv" ? { siteEmbeddings: [] } : {}),
    }));
  };

  /* ---------------------------- Convenience ----------------------------- */
  const setApiKey = (k: string) => setState((s) => ({ ...s, apiKey: k ?? "" }));

  /** Legacy setter; mirrors into generatorKeywords for consumers expecting it. */
  const setSyntheticQueries: WorkspaceCtx["setSyntheticQueries"] = (next) =>
    setState((s) => {
      const nextArr =
        typeof next === "function"
          ? next(s.syntheticQueries ?? [])
          : next ?? [];
      const deduped = dedupeSyntheticQueries(nextArr);
      return { ...s, syntheticQueries: deduped, generatorKeywords: deduped };
    });

  /** Preferred setter from Query Generator; mirrors into syntheticQueries. */
  const setGeneratorKeywords: WorkspaceCtx["setGeneratorKeywords"] = (next) =>
    setState((s) => {
      const prev = s.generatorKeywords ?? [];
      const nextArr = typeof next === "function" ? next(prev) : next ?? [];
      const deduped = dedupeSyntheticQueries(nextArr);
      return { ...s, generatorKeywords: deduped, syntheticQueries: deduped };
    });

  const setSiteEmbeddings: WorkspaceCtx["setSiteEmbeddings"] = (next) =>
    setState((s) => ({
      ...s,
      siteEmbeddings:
        typeof next === "function" ? next(s.siteEmbeddings ?? []) : next ?? [],
    }));

  /* ------------------------- Cross-tab navigation ------------------------ */
  const NAV_EVENT = "nexus:navigate";
  const navigate: WorkspaceCtx["navigate"] = (tab, detail = {}) => {
    window.dispatchEvent(
      new CustomEvent(NAV_EVENT, { detail: { tab, ...detail } })
    );
  };

  const pushKeywordsToPassageLab: WorkspaceCtx["pushKeywordsToPassageLab"] = (
    rows,
    opts
  ) => {
    setGeneratorKeywords(rows);
    navigate("passage", { autoImport: opts?.autoImport ?? true });
  };

  /* ----------------------------- Embedder glue --------------------------- */
  // If an API key is present, expose a batch embedder the Testing tab can call.
  const embedTextBatch = state.apiKey?.trim()
    ? (texts: string[]) => geminiEmbedBatch(texts, state.apiKey)
    : undefined;

  /* --------------------------------- Value -------------------------------- */
  const value = useMemo<WorkspaceCtx>(
    () => ({
      state,
      setState,

      apiKey: state.apiKey,

      syntheticQueries: state.syntheticQueries,
      generatorKeywords: state.generatorKeywords,

      siteEmbeddings: state.siteEmbeddings,

      setApiKey,
      setSyntheticQueries,
      setGeneratorKeywords,
      setSiteEmbeddings,

      loadCsvInto,
      clearCsv,

      navigate,
      pushKeywordsToPassageLab,

      embedTextBatch, // 👈 now available to consumers (e.g., TestingTab)
    }),
    [state]
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
};

export const useWorkspace = () => {
  const ctx = useContext(Context);
  if (!ctx)
    throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
};
