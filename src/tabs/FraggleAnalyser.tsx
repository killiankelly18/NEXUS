import React, { useState } from "react";
import { useWorkspace } from "../context/WorkspaceContext";
import { embedText } from "../lib/gemini";
import { cosineSimilarity } from "../lib/expertiseMetrics";
import { Target, Search, Sparkles, Activity, FileText } from "lucide-react";

export default function FraggleVisualizer() {
  const { apiKey } = useWorkspace();
  const [keyword, setKeyword] = useState("");
  const [pageContent, setPageContent] = useState("");
  const [fraggles, setFraggles] = useState<{ text: string; score: number }[]>(
    []
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const analyzeFraggles = async () => {
    if (!apiKey || !keyword || !pageContent) return alert("Missing data!");
    setIsAnalyzing(true);

    try {
      // 1. Vectorize the Target Keyword
      const queryVector = await embedText(apiKey, keyword);

      // 2. Split content into Fraggles (Paragraphs/Segments)
      const segments = pageContent
        .split(/\n\n/) // Simple split by double newline
        .filter((t) => t.trim().length > 20);

      // 3. Embed and Score each Fraggle
      const scored = await Promise.all(
        segments.map(async (text) => {
          const vector = await embedText(apiKey, text);
          const score = cosineSimilarity(queryVector, vector);
          return { text, score };
        })
      );

      // 4. Sort by relevance
      setFraggles(scored.sort((a, b) => b.score - a.score));
    } catch (e) {
      alert("Analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div
      style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}
    >
      <div
        style={{
          background: "#fff",
          padding: 24,
          borderRadius: 12,
          border: "1px solid #e5e7eb",
        }}
      >
        <h3
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            margin: "0 0 16px 0",
          }}
        >
          <Target color="#3b82f6" /> Fraggle Relevance Visualizer
        </h3>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 700 }}>
            1. TARGET SEARCH QUERY
          </label>
          <input
            style={{
              padding: 12,
              borderRadius: 8,
              border: "1px solid #d1d5db",
            }}
            placeholder="e.g. How to install wordpress plugins safely"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />

          <label style={{ fontSize: 12, fontWeight: 700 }}>
            2. PAGE CONTENT (FRAGGLE SOURCE)
          </label>
          <textarea
            style={{
              padding: 12,
              borderRadius: 8,
              border: "1px solid #d1d5db",
              minHeight: 150,
            }}
            placeholder="Paste the text from your page here..."
            value={pageContent}
            onChange={(e) => setPageContent(e.target.value)}
          />

          <button
            onClick={analyzeFraggles}
            disabled={isAnalyzing}
            style={{
              background: "#3b82f6",
              color: "#fff",
              padding: "12px",
              borderRadius: 8,
              border: "none",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {isAnalyzing
              ? "Computing Vector Relevance..."
              : "Reverse Engineer Fraggles"}
          </button>
        </div>
      </div>

      {fraggles.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h4 style={{ fontSize: 14, fontWeight: 800 }}>
            Semantic "Hotspots" (Highest Potential for AI Overview Citation)
          </h4>
          {fraggles.map((f, i) => (
            <div
              key={i}
              style={{
                background: "#fff",
                padding: 16,
                borderRadius: 8,
                borderLeft: `6px solid ${
                  f.score > 0.8 ? "#10b981" : "#fbbf24"
                }`,
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <span
                  style={{ fontSize: 10, fontWeight: 800, color: "#64748b" }}
                >
                  FRAGGLE #{i + 1}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 900,
                    color: f.score > 0.8 ? "#059669" : "#d97706",
                  }}
                >
                  RELEVANCE: {(f.score * 100).toFixed(2)}%
                </span>
              </div>
              <p
                style={{
                  fontSize: 14,
                  color: "#334155",
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                {f.text}
              </p>
              {f.score > 0.85 && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    color: "#059669",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Sparkles size={12} /> High Citation Probability
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
