/** Keep the classic Nexus look — same simple stroke SVGs, currentColor-driven. */ type IconProps =
  { size?: number; color?: string; style?: React.CSSProperties };
export const Search: React.FC<IconProps> = ({
  size = 24,
  color = "currentColor",
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    style={style}
  >
    {" "}
    <circle cx="11" cy="11" r="8" /> <path d="m21 21-4.35-4.35" />{" "}
  </svg>
);
export const Brain: React.FC<IconProps> = ({
  size = 24,
  color = "currentColor",
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    style={style}
  >
    {" "}
    <path d="M12 2a10 10 0 0 0-7.07 2.93C3.04 6.83 2 9.35 2 12c0 5.52 4.48 10 10 10s10-4.48 10-10c0-2.65-1.04-5.17-2.93-7.07A10 10 0 0 0 12 2z" />{" "}
    <path d="M8 12h8" /> <path d="M12 8v8" />{" "}
  </svg>
);
export const Target: React.FC<IconProps> = ({
  size = 24,
  color = "currentColor",
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    style={style}
  >
    {" "}
    <circle cx="12" cy="12" r="10" /> <circle cx="12" cy="12" r="6" />{" "}
    <circle cx="12" cy="12" r="2" />{" "}
  </svg>
);
export const Download: React.FC<IconProps> = ({
  size = 24,
  color = "currentColor",
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    style={style}
  >
    {" "}
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />{" "}
    <polyline points="7,10 12,15 17,10" />{" "}
    <line x1="12" y1="15" x2="12" y2="3" />{" "}
  </svg>
);
export const Zap: React.FC<IconProps> = ({
  size = 24,
  color = "currentColor",
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    style={style}
  >
    {" "}
    <polygon points="13,2 3,14 12,14 11,22 21,10 12,10 13,2" />{" "}
  </svg>
);
export const AlertCircle: React.FC<IconProps> = ({
  size = 24,
  color = "currentColor",
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    style={style}
  >
    {" "}
    <circle cx="12" cy="12" r="10" /> <line x1="12" y1="8" x2="12" y2="12" />{" "}
    <line x1="12" y1="16" x2="12.01" y2="16" />{" "}
  </svg>
);
export const CheckCircle: React.FC<IconProps> = ({
  size = 24,
  color = "currentColor",
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    style={style}
  >
    {" "}
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />{" "}
    <polyline points="22,4 12,14.01 9,11.01" />{" "}
  </svg>
);
export const Clock: React.FC<IconProps> = ({
  size = 24,
  color = "currentColor",
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    style={style}
  >
    {" "}
    <circle
      cx="12"
      cy="12"
      r="10"
    /> <polyline points="12,6 12,12 16,14" />{" "}
  </svg>
);
export const Sparkles: React.FC<IconProps> = ({
  size = 24,
  color = "currentColor",
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    style={style}
  >
    {" "}
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />{" "}
  </svg>
);
export const FileText: React.FC<IconProps> = ({
  size = 24,
  color = "currentColor",
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    style={style}
  >
    {" "}
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />{" "}
    <polyline points="14,2 14,8 20,8" /> <line x1="16" y1="13" x2="8" y2="13" />{" "}
    <line x1="16" y1="17" x2="8" y2="17" /> <polyline points="10,9 9,9 8,9" />{" "}
  </svg>
);
export const Upload: React.FC<IconProps> = ({
  size = 24,
  color = "currentColor",
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    style={style}
  >
    {" "}
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />{" "}
    <polyline points="17,8 12,3 7,8" /> <line x1="12" y1="3" x2="12" y2="15" />{" "}
  </svg>
);
export const Database: React.FC<IconProps> = ({
  size = 24,
  color = "currentColor",
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    style={style}
  >
    {" "}
    <ellipse cx="12" cy="5" rx="9" ry="3" />{" "}
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />{" "}
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />{" "}
  </svg>
);
export const Cpu: React.FC<IconProps> = ({
  size = 24,
  color = "currentColor",
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    style={style}
  >
    {" "}
    <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />{" "}
    <rect x="9" y="9" width="6" height="6" />{" "}
    <line x1="9" y1="1" x2="9" y2="4" /> <line x1="15" y1="1" x2="15" y2="4" />{" "}
    <line x1="9" y1="20" x2="9" y2="23" />{" "}
    <line x1="15" y1="20" x2="15" y2="23" />{" "}
    <line x1="20" y1="9" x2="23" y2="9" />{" "}
    <line x1="20" y1="14" x2="23" y2="14" />{" "}
    <line x1="1" y1="9" x2="4" y2="9" /> <line x1="1" y1="14" x2="4" y2="14" />{" "}
  </svg>
);
export const Network: React.FC<IconProps> = ({
  size = 24,
  color = "currentColor",
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    style={style}
  >
    {" "}
    <rect x="9" y="16" width="6" height="6" rx="1" />{" "}
    <rect x="16" y="9" width="6" height="6" rx="1" />{" "}
    <rect x="2" y="9" width="6" height="6" rx="1" /> <path d="m12 12 4-4" />{" "}
    <path d="m8 12-4-4" /> <path d="M12 12v4" />{" "}
  </svg>
);
export const Shield: React.FC<IconProps> = ({
  size = 24,
  color = "currentColor",
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    style={style}
  >
    {" "}
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />{" "}
  </svg>
);
export const LinkIcon: React.FC<IconProps> = ({
  size = 24,
  color = "currentColor",
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    style={style}
  >
    {" "}
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72" />{" "}
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.72" />{" "}
  </svg>
);
export const Layers: React.FC<IconProps> = ({
  size = 24,
  color = "currentColor",
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    style={style}
  >
    {" "}
    <polygon points="12,2 2,7 12,12 22,7 12,2" />{" "}
    <polyline points="2,17 12,22 22,17" />{" "}
    <polyline points="2,12 12,17 22,12" />{" "}
  </svg>
);
export const TrendingUp: React.FC<IconProps> = ({
  size = 24,
  color = "currentColor",
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    style={style}
  >
    {" "}
    <polyline points="22,7 13.5,15.5 8.5,10.5 2,17" />{" "}
    <polyline points="16,7 22,7 22,13" />{" "}
  </svg>
);
export const Info: React.FC<IconProps> = ({
  size = 24,
  color = "currentColor",
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    style={style}
  >
    {" "}
    <circle cx="12" cy="12" r="10" /> <line x1="12" y1="16" x2="12" y2="12" />{" "}
    <line x1="12" y1="8" x2="12.01" y2="8" />{" "}
  </svg>
);
export const ChevronDown: React.FC<IconProps> = ({
  size = 24,
  color = "currentColor",
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    style={style}
  >
    {" "}
    <polyline points="6,9 12,15 18,9" />{" "}
  </svg>
);
export const ChevronUp: React.FC<IconProps> = ({
  size = 24,
  color = "currentColor",
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    style={style}
  >
    {" "}
    <polyline points="18,15 12,9 6,15" />{" "}
  </svg>
);
export const Activity: React.FC<IconProps> = ({
  size = 24,
  color = "currentColor",
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    style={style}
  >
    {" "}
    <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" />{" "}
  </svg>
);
/** Optional: a dictionary for dynamic lookups */ export const Icons = {
  Search,
  Brain,
  Target,
  Download,
  Zap,
  AlertCircle,
  CheckCircle,
  Clock,
  Sparkles,
  FileText,
  Upload,
  Database,
  Cpu,
  Network,
  Shield,
  LinkIcon,
  Layers,
  TrendingUp,
  Info,
  ChevronDown,
  ChevronUp,
  Activity,
};
export type { IconProps };
