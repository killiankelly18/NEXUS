// src/components/ClusterScatter.tsx
import React from "react";

type Point = {
  id: string;
  x: number;
  y: number;
  color: string;
  label?: string;
};

function palette(i: number) {
  // pleasant distinct palette
  const COLORS = [
    "#2563eb",
    "#16a34a",
    "#dc2626",
    "#7c3aed",
    "#ea580c",
    "#0891b2",
    "#65a30d",
    "#d946ef",
    "#f59e0b",
    "#0ea5e9",
  ];
  return COLORS[i % COLORS.length];
}

export default function ClusterScatter({
  points,
  width = 640,
  height = 420,
  pointSize = 3,
}: {
  points: Point[];
  width?: number;
  height?: number;
  pointSize?: number;
}) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  const [cx, setCx] = React.useState(0);
  const [cy, setCy] = React.useState(0);
  const [scale, setScale] = React.useState(1);
  const [hover, setHover] = React.useState<Point | null>(null);

  // fit to view on first draw
  React.useEffect(() => {
    if (!points.length) return;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs);
    const minY = Math.min(...ys),
      maxY = Math.max(...ys);
    const cx0 = (minX + maxX) / 2;
    const cy0 = (minY + maxY) / 2;
    const sx = (width - 20) / (maxX - minX || 1);
    const sy = (height - 20) / (maxY - minY || 1);
    setCx(cx0);
    setCy(cy0);
    setScale(Math.min(sx, sy));
  }, [points, width, height]);

  // draw
  React.useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(scale, -scale);
    ctx.translate(-cx, -cy);

    for (const p of points) {
      ctx.beginPath();
      ctx.fillStyle = p.color;
      ctx.arc(p.x, p.y, pointSize / Math.max(1, scale), 0, Math.PI * 2);
      ctx.fill();
    }

    // hover highlight
    if (hover) {
      ctx.beginPath();
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 2 / Math.max(1, scale);
      ctx.arc(
        hover.x,
        hover.y,
        (pointSize + 2) / Math.max(1, scale),
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }
    ctx.restore();
  }, [points, width, height, pointSize, cx, cy, scale, hover]);

  // mouse interactions
  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    function toDataCoords(evt: MouseEvent) {
      const rect = canvas.getBoundingClientRect();
      const mx = evt.clientX - rect.left;
      const my = evt.clientY - rect.top;
      // inverse transform
      const x = (mx - width / 2) / scale + cx;
      const y = -(my - height / 2) / scale + cy;
      return { x, y };
    }
    let dragging = false;
    let prev: { x: number; y: number } | null = null;

    const onDown = (e: MouseEvent) => {
      dragging = true;
      prev = toDataCoords(e);
    };
    const onMove = (e: MouseEvent) => {
      const pt = toDataCoords(e);
      if (dragging && prev) {
        const dx = prev.x - pt.x,
          dy = prev.y - pt.y;
        setCx((c) => c + dx);
        setCy((c) => c + dy);
      }
      // hover detect (simple nearest)
      let best: Point | null = null,
        bestD = Infinity;
      for (const p of points) {
        const d = (p.x - pt.x) ** 2 + (p.y - pt.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      setHover(best && Math.sqrt(bestD) < 10 / scale ? best : null);
    };
    const onUp = () => {
      dragging = false;
      prev = null;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      setScale((s) => Math.max(0.1, Math.min(50, s * factor)));
    };

    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("wheel", onWheel as any);
    };
  }, [points, scale, cx, cy, width, height]);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <canvas
        ref={ref}
        width={width}
        height={height}
        style={{ border: "1px solid #e5e7eb", borderRadius: 8 }}
      />
      {hover && (
        <div style={{ fontSize: 12, color: "#334155" }}>
          <b>{hover.label || hover.id}</b>
        </div>
      )}
    </div>
  );
}

export function colorByCluster(id: number) {
  return palette(id);
}
