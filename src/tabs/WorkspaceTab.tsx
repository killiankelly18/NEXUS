// Nexus — WorkspaceTab (restyled, drop-in) — with "Query & Backlink Data" card
import React from "react";
import {
  Upload,
  FileText,
  CheckCircle,
  Sparkles,
  Key,
  X,
  Copy,
  Database,
  Link as LinkIcon,
  AlertCircle,
} from "lucide-react";

/* ===== Adapters (same pattern as yours) ===== */
let useWorkspace: () => {
  apiKey: string;
  setApiKey: (v: string) => void;
  loadCsvInto: (kind: string, rows: any[]) => void;
  clearCsv: (kind: string) => void;
  setSiteEmbeddings: (rows: { url: string; embedding: number[] }[]) => void;
  state: {
    queriesCsv: any[];
    embeddingsCsv: any[];
    authorityCsv: any[];
    queryBacklinkCsv?: any[]; // NEW
  };
};
let readCsv: (file?: File, opts?: any) => Promise<{ rows: any[] }>;
let DEFAULT_ALIASES: string[];

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ws = require("../context/WorkspaceContext");
  if (ws?.useWorkspace) useWorkspace = ws.useWorkspace;
} catch {}
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const csv = require("../lib/csv");
  if (csv?.readCsv) readCsv = csv.readCsv;
  if (csv?.DEFAULT_ALIASES) DEFAULT_ALIASES = csv.DEFAULT_ALIASES;
} catch {}

if (!useWorkspace) {
  useWorkspace = () => ({
    apiKey: "",
    setApiKey: () => {},
    loadCsvInto: () => {},
    clearCsv: () => {},
    setSiteEmbeddings: () => {},
    state: {
      queriesCsv: [],
      embeddingsCsv: [],
      authorityCsv: [],
      queryBacklinkCsv: [], // NEW
    },
  });
}
if (!readCsv) readCsv = async () => ({ rows: [] });
if (!DEFAULT_ALIASES) DEFAULT_ALIASES = [];

/* ===== Helpers (unchanged + small adds) ===== */
const NBSP = String.fromCharCode(160);
const BOM = "\uFEFF";
type Row = Record<string, any>;
type Preview = { columns: string[]; rows: Row[]; total: number };

const normalizeKey = (k: unknown) =>
  String(k ?? "")
    .replace(new RegExp(BOM, "g"), "")
    .replace(new RegExp(NBSP, "g"), " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "");

const pickByAliases = (row: Row, aliases: string[]) => {
  const keyMap = new Map<string, string>();
  for (const key of Object.keys(row)) keyMap.set(normalizeKey(key), key);
  for (const alias of aliases) {
    const norm = normalizeKey(alias);
    if (keyMap.has(norm)) return row[keyMap.get(norm)!];
  }
  return undefined;
};

const cleanValueText = (val: unknown) =>
  String(val ?? "")
    .replace(new RegExp(BOM, "g"), "")
    .replace(new RegExp(NBSP, "g"), " ")
    .trim();

const parseEmbedding = (val: unknown): number[] | null => {
  if (val == null) return null;
  let txt = cleanValueText(val);
  if (!txt) return null;
  if (
    (txt.startsWith('"') && txt.endsWith('"')) ||
    (txt.startsWith("'") && txt.endsWith("'"))
  )
    txt = txt.slice(1, -1).trim();

  if (txt.startsWith("[") && txt.endsWith("]")) {
    try {
      const arr = JSON.parse(txt);
      if (Array.isArray(arr)) {
        const nums = arr.map((x) => Number(x)).filter(Number.isFinite);
        return nums.length ? nums : null;
      }
    } catch {}
  }
  const safe = txt.replace(/[^0-9eE+\-.,;\s|\[\]]+/g, " ").trim();
  const unbracketed = safe.replace(/^\[|\]$/g, " ").trim();
  const parts = unbracketed.split(/[ ,;|\t\n\r]+/).filter(Boolean);
  const nums = parts.map((s) => Number(s)).filter(Number.isFinite);
  return nums.length ? nums : null;
};

/* ===== Upload area + preview (unchanged) ===== */
type UploadAreaProps = {
  label: string;
  accept: string;
  onFiles: (files: FileList) => void;
  busy?: boolean;
  hint?: string;
  style?: React.CSSProperties;
};
function UploadArea({
  label,
  accept,
  onFiles,
  busy,
  hint,
  style,
}: UploadAreaProps) {
  const [dragActive, setDragActive] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0])
      onFiles(e.dataTransfer.files);
  };
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) onFiles(e.target.files);
  };
  return (
    <div style={style}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        style={{ display: "none" }}
        disabled={busy}
      />
      <div
        style={{
          border: dragActive ? "2px dashed #3b82f6" : "2px dashed #d1d5db",
          borderRadius: 12,
          padding: 20,
          textAlign: "center",
          cursor: busy ? "not-allowed" : "pointer",
          transition: "all .2s",
          background: dragActive ? "#eff6ff" : "#f9fafb",
          transform: dragActive ? "scale(1.02)" : "scale(1)",
          opacity: busy ? 0.7 : 1,
          position: "relative",
        }}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !busy && inputRef.current?.click()}
      >
        <Upload size={20} style={{ color: "#6b7280", marginBottom: 8 }} />
        <div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "#374151",
              marginBottom: 4,
            }}
          >
            {label}
          </div>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>{hint}</div>
        </div>
        {busy && (
          <div
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              width: 18,
              height: 18,
              border: "2px solid #e5e7eb",
              borderTop: "2px solid #3b82f6",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
        )}
      </div>
    </div>
  );
}

function TablePreview({ data }: { data: Preview | null }) {
  if (!data) return null;
  const { columns, rows, total } = data;
  return (
    <div
      style={{
        background: "white",
        borderRadius: 16,
        padding: 24,
        boxShadow:
          "0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -1px rgba(0,0,0,.06)",
        border: "2px solid #f3f4f6",
        marginTop: 24,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <h3
          style={{ fontSize: 18, fontWeight: 600, color: "#111827", margin: 0 }}
        >
          Data Preview
        </h3>
        <span
          style={{
            fontSize: 14,
            color: "#6b7280",
            background: "#f3f4f6",
            padding: "4px 8px",
            borderRadius: 6,
          }}
        >
          Showing {rows.length} of {total} rows
        </span>
      </div>
      <div
        style={{
          overflowX: "auto",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
        }}
      >
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
        >
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c}
                  style={{
                    background: "#f9fafb",
                    padding: "12px 16px",
                    textAlign: "left",
                    fontWeight: 600,
                    color: "#374151",
                    borderBottom: "2px solid #e5e7eb",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td
                    key={c}
                    title={String(r[c] ?? "")}
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid #f3f4f6",
                      color: "#111827",
                      whiteSpace: "nowrap",
                      maxWidth: 300,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {String(r[c] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ===== Main ===== */
type DatasetId =
  | "queriesCsv"
  | "embeddingsCsv"
  | "authorityCsv"
  | "queryBacklinkCsv"; // NEW

export default function WorkspaceTab() {
  const { apiKey, setApiKey, loadCsvInto, clearCsv, state, setSiteEmbeddings } =
    useWorkspace();

  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [previewById, setPreviewById] = React.useState<
    Record<DatasetId, Preview | null>
  >({
    queriesCsv: null,
    embeddingsCsv: null,
    authorityCsv: null,
    queryBacklinkCsv: null, // NEW
  });
  const [activePreview, setActivePreview] = React.useState<DatasetId | null>(
    null
  );

  const makePreview = (rows: Row[]): Preview => {
    const first = rows[0] || {};
    const columns = Object.keys(first);
    return { columns, rows: rows.slice(0, 5), total: rows.length };
  };

  const handleUpload = async (files: FileList, kind: DatasetId) => {
    const f = files?.[0];
    if (!f) return;
    setError("");
    setBusy(true);

    try {
      const { rows } = await readCsv(f, { aliases: DEFAULT_ALIASES });

      if (kind === "queriesCsv") {
        const sample = rows[0] || {};
        const hasQueryCol = Object.keys(sample).some((k) =>
          /^(query|keyword|phrase)$/i.test(k.trim())
        );
        if (!hasQueryCol) throw new Error("Missing a query/keyword column");
      }

      if (kind === "embeddingsCsv") {
        const URL_ALIASES = [
          "url",
          "address",
          "page",
          "page url",
          "page address",
          "canonical url",
        ];
        const EMB_ALIASES = [
          "extract semantic embeddings from page",
          "extract semantic embeddings",
          "embedding",
          "embeddings",
          "embedding json",
          "page embedding",
          "page embeddings",
          "semantic embedding",
          "semantic embeddings",
        ];
        const parsed = rows
          .map((r, i) => {
            const urlVal = pickByAliases(r, URL_ALIASES) ?? "Row " + (i + 1);
            const embVal = pickByAliases(r, EMB_ALIASES);
            const url = cleanValueText(urlVal);
            const vec = parseEmbedding(embVal);
            if (!url || !vec) return null;
            return { url, embedding: vec } as const;
          })
          .filter(Boolean) as { url: string; embedding: number[] }[];

        if (!parsed.length) {
          console.warn(
            "Embeddings CSV headers seen:",
            Object.keys(rows[0] || {})
          );
          throw new Error(
            'Embeddings CSV needs a URL-like column (e.g., Address/URL/Page) and an embedding column (e.g., "Extract semantic embeddings from page").'
          );
        }
        setSiteEmbeddings(parsed);
      }

      if (kind === "queryBacklinkCsv") {
        // Minimal validation for combined data
        const sample = rows[0] || {};
        const cols = Object.keys(sample).map((k) => k.trim().toLowerCase());
        const hasUrl = cols.some((k) =>
          /^(url|address|page|page url|canonical url)$/i.test(k)
        );
        const hasQuery = cols.some((k) =>
          /^(query|keyword|phrase|top keyword)$/i.test(k)
        );
        const hasAuthority = cols.some((k) =>
          /^(ref.?domains?|links?|dr|domain.?rating|authority)$/i.test(k)
        );
        if (!hasUrl) throw new Error("Missing a URL column");
        if (!hasQuery && !hasAuthority)
          throw new Error(
            "Need at least a query/keyword column or an authority metric (ref_domains/links/DR)."
          );
      }

      loadCsvInto(kind, rows);
      const pv = makePreview(rows);
      setPreviewById((cur) => ({ ...cur, [kind]: pv }));
      setActivePreview(kind);
    } catch (e: any) {
      setError(e?.message || "Failed to parse CSV");
    } finally {
      setBusy(false);
    }
  };

  const datasets = [
    {
      id: "embeddingsCsv" as DatasetId,
      title: "Page Embeddings",
      description: "Pre-computed page vectors for relevance analysis",
      icon: Sparkles,
      color: "#8b5cf6",
      required: true,
      uploadText: "Upload embeddings CSV",
      columns: "url/address/page + embedding columns",
      data: state.embeddingsCsv,
    },

    // NEW CARD
    {
      id: "queryBacklinkCsv" as DatasetId,
      title: "Query & Backlink Data",
      description:
        "Unified export with URL + queries (GSC/Ahrefs/Semrush) and optional link metrics for fusion clustering & fit audits",
      icon: LinkIcon,
      color: "#f59e0b",
      required: false,
      uploadText: "Upload query & backlink CSV",
      columns:
        "url + (query/keyword) and/or (ref_domains/links/DR). Example: Ahrefs Top pages or Organic keywords export",
      data: state.queryBacklinkCsv ?? [],
    },
  ];

  return (
    <div
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: 24,
        fontFamily:
          "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: "#1f2937",
            margin: "0 0 8px 0",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          🧰 Workspace
        </h1>
        <p
          style={{ fontSize: 16, color: "#6b7280", margin: 0, lineHeight: 1.5 }}
        >
          Configure your API key and upload datasets. All data is stored locally
          and cleared on reload.
        </p>
      </div>

      {/* API key (unchanged) */}
      <div
        style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          borderRadius: 16,
          padding: 24,
          marginBottom: 32,
          color: "white",
          boxShadow:
            "0 10px 20px rgba(118,75,162,0.2), 0 6px 10px rgba(0,0,0,0.06)",
        }}
      >
        <style>{`.apiKeyInput::placeholder{color:rgba(255,255,255,.95)}`}</style>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <Key size={20} />
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
            Gemini API Key
          </h2>
        </div>
        <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
          <input
            className="apiKeyInput"
            style={{
              flex: 1,
              padding: "12px 16px",
              border: "2px solid rgba(255,255,255,.2)",
              borderRadius: 8,
              background: "rgba(255,255,255,.1)",
              color: "white",
              fontSize: 14,
              outline: "none",
            }}
            placeholder="Paste your Google AI Studio key here..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            type="password"
          />
          <button
            style={{
              padding: "12px 16px",
              border: "2px solid rgba(255,255,255,.3)",
              borderRadius: 8,
              background: "rgba(255,255,255,.1)",
              color: "white",
              cursor: apiKey ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              gap: 8,
              opacity: apiKey ? 1 : 0.5,
            }}
            onClick={() => apiKey && navigator.clipboard.writeText(apiKey)}
            disabled={!apiKey}
            title="Copy API key"
          >
            <Copy size={16} /> Copy
          </button>
        </div>
        <p style={{ fontSize: 13, opacity: 0.85, margin: 0 }}>
          Stored only in memory for this session
        </p>
      </div>

      {/* Dataset grid with NEW card */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
          gap: 24,
          marginBottom: 32,
        }}
      >
        {datasets.map((dataset) => {
          const IconComponent = dataset.icon;
          const hasData = (dataset.data?.length ?? 0) > 0;
          return (
            <div
              key={dataset.id}
              style={{
                background: "white",
                borderRadius: 16,
                padding: 24,
                boxShadow:
                  "0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -1px rgba(0,0,0,.06)",
                border: "2px solid #f3f4f6",
                borderTop: `4px solid ${dataset.color}`,
                position: "relative",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: `${dataset.color}20`,
                    color: dataset.color,
                  }}
                >
                  <IconComponent size={20} />
                </div>
                <div style={{ flex: 1 }}>
                  <h3
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: "#111827",
                      margin: "0 0 2px 0",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {dataset.title}
                    {dataset.required && (
                      <span
                        style={{
                          background: "#ef4444",
                          color: "white",
                          fontSize: 10,
                          fontWeight: 600,
                          padding: "2px 6px",
                          borderRadius: 4,
                          textTransform: "uppercase",
                        }}
                      >
                        Required
                      </span>
                    )}
                  </h3>
                  <p
                    style={{
                      fontSize: 14,
                      color: "#6b7280",
                      margin: 0,
                      lineHeight: 1.4,
                    }}
                  >
                    {dataset.description}
                  </p>
                </div>
              </div>

              <UploadArea
                label={dataset.uploadText}
                accept=".csv"
                onFiles={(files) => handleUpload(files, dataset.id)}
                busy={busy}
                hint={"Expected columns: " + dataset.columns}
                style={{ margin: "16px 0" }}
              />

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  background: hasData ? "#f0fdf4" : "#f9fafb",
                  border: hasData ? "1px solid #bbf7d0" : "none",
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 14,
                    color: hasData ? "#16a34a" : "#6b7280",
                  }}
                >
                  <FileText size={16} />
                  <span>
                    {hasData
                      ? dataset.data.length + " rows loaded"
                      : "No file loaded"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {previewById[dataset.id] && (
                    <button
                      style={{
                        padding: "6px 12px",
                        border: "1px solid #e5e7eb",
                        borderRadius: 6,
                        background: "white",
                        color: "#374151",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                      onClick={() => setActivePreview(dataset.id)}
                    >
                      Preview
                    </button>
                  )}
                  {hasData && (
                    <button
                      style={{
                        padding: "6px 12px",
                        border: "1px solid #dc2626",
                        borderRadius: 6,
                        background: "transparent",
                        color: "#dc2626",
                        fontSize: 12,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                      onClick={() => {
                        clearCsv(dataset.id);
                        setPreviewById((cur) => ({
                          ...cur,
                          [dataset.id]: null,
                        }));
                        if (activePreview === dataset.id)
                          setActivePreview(null);
                      }}
                    >
                      <X size={14} /> Clear
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Errors + Preview */}
      {error && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 12,
            padding: 16,
            display: "flex",
            alignItems: "center",
            gap: 12,
            color: "#b91c1c",
            marginBottom: 24,
          }}
        >
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}
      <TablePreview data={activePreview ? previewById[activePreview] : null} />

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
