// src/main.tsx or src/index.tsx
import "./styles.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { WorkspaceProvider } from "./context/WorkspaceContext"; // ✅ import provider

const rootElement = document.getElementById("root")!;
const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <WorkspaceProvider>
      <App />
    </WorkspaceProvider>
  </React.StrictMode>
);

// --- Temporary mock embedder for Testing tab ---
(window as any).nexusEmbedText = async (texts: string[]) => {
  const dim = 64;
  return texts.map((t) => {
    const v = new Array(dim).fill(0);
    for (let i = 0; i < t.length; i++) {
      const code = t.charCodeAt(i);
      v[code % dim] += 1;
    }
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / norm);
  });
};
