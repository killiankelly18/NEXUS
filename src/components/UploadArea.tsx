// src/components/UploadArea.tsx
import React from "react";

type Props = {
  label: string;
  accept?: string;
  multiple?: boolean;
  busy?: boolean;
  hint?: string;
  onFiles: (files: FileList) => void;
  style?: React.CSSProperties;
};

const box: React.CSSProperties = {
  border: "1px dashed #94a3b8",
  borderRadius: 8,
  padding: 16,
  background: "#f8fafc",
  transition: "background 120ms ease, border-color 120ms ease, opacity 120ms",
};

export default function UploadArea({
  label,
  accept,
  multiple,
  busy,
  hint,
  onFiles,
  style,
}: Props) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = React.useState(false);

  return (
    <div
      style={{
        ...box,
        ...(dragOver
          ? { background: "#eef2ff", borderColor: "#6366f1" }
          : null),
        ...(busy ? { opacity: 0.6, pointerEvents: "none" } : null),
        ...(style || {}),
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer?.files?.length) onFiles(e.dataTransfer.files);
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 600, color: "#0f172a" }}>{label}</div>
          {hint && (
            <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>
              {hint}
            </div>
          )}
        </div>
        <div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid #94a3b8",
              background: "#ffffff",
              cursor: "pointer",
            }}
          >
            {busy ? "Processing…" : "Choose file"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple={multiple}
            onChange={(e) => e.target.files && onFiles(e.target.files)}
            style={{ display: "none" }}
          />
        </div>
      </div>
    </div>
  );
}
