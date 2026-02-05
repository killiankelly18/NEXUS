// src/tabs/NexusOverviewTab.tsx
import React, { useState } from "react";
import { useWorkspace } from "../context/WorkspaceContext";
import {
  Sparkles,
  Layers,
  Target,
  Link as LinkIcon,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Database,
  Cpu,
  Scissors,
  Network,
  Maximize,
  Minimize,
  FileText,
  Search,
  Shield
} from "lucide-react";

/* --- Styles --- */
const styles: Record<string, React.CSSProperties> = {
  page: { padding: 24, maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 40 },
  
  // Hero
  hero: { 
    background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)', 
    borderRadius: 20, 
    padding: 40, 
    color: '#fff', 
    boxShadow: '0 20px 40px -10px rgba(30, 64, 175, 0.4)',
    position: 'relative',
    overflow: 'hidden'
  },
  heroContent: { position: 'relative', zIndex: 2 },
  heroTitle: { fontSize: 36, fontWeight: 800, margin: '0 0 16px 0', letterSpacing: '-0.03em' },
  heroText: { fontSize: 18, opacity: 0.9, maxWidth: 680, lineHeight: 1.6 },

  // Status Bar
  statusBar: { display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 32 },
  statusChip: (active: boolean) => ({
    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderRadius: 99, 
    background: active ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)', 
    border: `1px solid ${active ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.15)'}`,
    color: '#fff', fontSize: 14, fontWeight: 600, backdropFilter: 'blur(4px)'
  }),

  // Section Headers
  sectionHeader: { fontSize: 22, fontWeight: 800, color: '#111827', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 },
  
  // The Engineering Grid
  engGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 },
  actionCard: { 
    background: '#fff', borderRadius: 16, padding: 28, 
    border: '1px solid #e5e7eb', 
    display: 'flex', flexDirection: 'column', 
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
  },
  actionIcon: (color: string) => ({ 
    width: 56, height: 56, borderRadius: 14, 
    background: color, color: '#fff', 
    display: 'flex', alignItems: 'center', justifyContent: 'center', 
    marginBottom: 20, boxShadow: `0 8px 16px -4px ${color}60`
  }),
  actionTitle: { fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 8 },
  actionDesc: { fontSize: 15, color: '#64748b', lineHeight: 1.5, marginBottom: 24, flex: 1 },
  actionBtn: { 
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, 
    padding: '12px', borderRadius: 10, 
    background: '#f8fafc', border: '1px solid #e2e8f0', 
    color: '#334155', fontWeight: 700, cursor: 'pointer', 
    transition: 'all 0.1s', textDecoration: 'none'
  },

  // Use Cases Section
  useCaseBox: { background: '#f9fafb', borderRadius: 20, padding: 32, border: '1px solid #e5e7eb' },
  ucGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 40 },
  ucCategory: { marginBottom: 16, fontSize: 14, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 },
  ucList: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 16 },
  ucItem: { display: 'flex', gap: 12, alignItems: 'start' },
  ucText: { fontSize: 15, color: '#334155', lineHeight: 1.5 },
  ucBold: { fontWeight: 700, color: '#0f172a' }
};

export default function NexusOverviewTab() {
  const { apiKey, state, navigate } = useWorkspace();

  // Status Checks
  const hasKey = !!apiKey;
  const hasEmbeddings = state.embeddingsCsv.length > 0;
  const hasQueries = state.queriesCsv.length > 0;

  // Navigation Helper
  const go = (tab: string) => navigate(tab);

  return (
    <div style={styles.page}>
      {/* 1. Hero Section */}
      <div style={styles.hero}>
        <div style={styles.heroContent}>
          <h1 style={styles.heroTitle}>Semantic Engineering Platform</h1>
          <p style={styles.heroText}>
            Nexus allows you to reverse-engineer the "AI Mode" of search. 
            By analyzing vector embeddings, it reveals how Google interprets your content's 
            focus, breadth, and structure—so you can engineer it to win.
          </p>
          
          <div style={styles.statusBar}>
            <div style={styles.statusChip(hasKey)}>
              {hasKey ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              {hasKey ? "AI Connection Active" : "Missing API Key"}
            </div>
            <div style={styles.statusChip(hasEmbeddings)}>
              {hasEmbeddings ? <Database size={18} /> : <AlertCircle size={18} />}
              {hasEmbeddings ? `${state.embeddingsCsv.length.toLocaleString()} Embeddings Loaded` : "No Data Loaded"}
            </div>
          </div>
        </div>
      </div>

      {/* 2. The Engineering Framework */}
      <div>
        <div style={styles.sectionHeader}>
          <Cpu size={24} color="#4b5563"/> 
          The Engineering Framework
        </div>
        <div style={styles.engGrid}>
          
          {/* PRUNE */}
          <div style={styles.actionCard}>
            <div style={styles.actionIcon('#ef4444')}><Scissors size={28}/></div>
            <h3 style={styles.actionTitle}>1. Prune</h3>
            <p style={styles.actionDesc}>
              <strong>Goal: Clarity.</strong><br/>
              Identify overlapping pages (cannibalization) and "drift" content that dilutes your topical authority.
            </p>
            <button style={styles.actionBtn} onClick={() => go('cannibal')}>
              Run Cannibalization Check
            </button>
          </div>

          {/* EXPAND */}
          <div style={styles.actionCard}>
            <div style={styles.actionIcon('#f59e0b')}><Maximize size={28}/></div>
            <h3 style={styles.actionTitle}>2. Expand</h3>
            <p style={styles.actionDesc}>
              <strong>Goal: Reach.</strong><br/>
              Fan out topics into synthetic user queries to find gaps where you lack content for specific intents.
            </p>
            <button style={styles.actionBtn} onClick={() => go('topics')}>
              Launch Topic Mapper
            </button>
          </div>

          {/* STRUCTURE */}
          <div style={styles.actionCard}>
            <div style={styles.actionIcon('#3b82f6')}><Network size={28}/></div>
            <h3 style={styles.actionTitle}>3. Structure</h3>
            <p style={styles.actionDesc}>
              <strong>Goal: Connectivity.</strong><br/>
              Engineer Hub & Spoke models. Group related pages and build internal links to pass authority.
            </p>
            <button style={styles.actionBtn} onClick={() => go('hubBuilder')}>
              Open Hub Builder
            </button>
          </div>

          {/* DENSIFY */}
          <div style={styles.actionCard}>
            <div style={styles.actionIcon('#10b981')}><Shield size={28}/></div>
            <h3 style={styles.actionTitle}>4. Densify</h3>
            <p style={styles.actionDesc}>
              <strong>Goal: Quality.</strong><br/>
              Audit your "Site Vector" to ensure your content core is tight, expert, and high-effort.
            </p>
            <button style={styles.actionBtn} onClick={() => go('expertise')}>
              Run Expertise Audit
            </button>
          </div>
        </div>
      </div>

      {/* 3. Full Capabilities Breakdown */}
      <div style={styles.useCaseBox}>
        <div style={{...styles.sectionHeader, marginBottom: 32}}>
          <Sparkles size={24} color="#7c3aed"/> 
          Platform Capabilities & Use Cases
        </div>
        
        <div style={styles.ucGrid}>
          {/* Column 1: Strategy & Planning */}
          <div>
            <div style={styles.ucCategory}>Strategy & Planning</div>
            <ul style={styles.ucList}>
              <li style={styles.ucItem}>
                <Search size={20} color="#3b82f6" style={{minWidth: 20}}/>
                <div style={styles.ucText}><span style={styles.ucBold}>Simulate AI Search:</span> Use the <em>Query Generator</em> to mimic how Google's AI expands a seed keyword into hundreds of intent variations.</div>
              </li>
              <li style={styles.ucItem}>
                <Target size={20} color="#3b82f6" style={{minWidth: 20}}/>
                <div style={styles.ucText}><span style={styles.ucBold}>Gap Analysis:</span> Map those synthetic queries against your site to find exactly where you have no content coverage.</div>
              </li>
              <li style={styles.ucItem}>
                <Layers size={20} color="#3b82f6" style={{minWidth: 20}}/>
                <div style={styles.ucText}><span style={styles.ucBold}>Topic Hub Engineering:</span> Use the <em>Hub Builder</em> to find existing pages that semantically fit a specific topic (e.g. "AI Sales").</div>
              </li>
            </ul>
          </div>

          {/* Column 2: Technical & Quality */}
          <div>
            <div style={styles.ucCategory}>Technical & Quality</div>
            <ul style={styles.ucList}>
               <li style={styles.ucItem}>
                <Scissors size={20} color="#ef4444" style={{minWidth: 20}}/>
                <div style={styles.ucText}><span style={styles.ucBold}>Fix Cannibalization:</span> Use vector math to find pages that are >95% similar and competing for the same rank. Merge or redirect them.</div>
              </li>
              <li style={styles.ucItem}>
                <Shield size={20} color="#10b981" style={{minWidth: 20}}/>
                <div style={styles.ucText}><span style={styles.ucBold}>Expertise Audit:</span> Measure your site's "Global Centroid" to prove to stakeholders that your content is focused (or identify drift).</div>
              </li>
               <li style={styles.ucItem}>
                <LinkIcon size={20} color="#8b5cf6" style={{minWidth: 20}}/>
                <div style={styles.ucText}><span style={styles.ucBold}>Semantic Linking:</span> Upload a target page and find the top 20 most semantically relevant pages to link <em>from</em>.</div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}