// src/lib/utils.ts
export function dedupeCaseInsensitive<T>(
  items: T[],
  getKey: (t: T) => string
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const k = (getKey(it) || "").trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

export function downloadCSV(filename: string, rows: string[][]) {
  const csv = rows
    .map((r) =>
      r.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
