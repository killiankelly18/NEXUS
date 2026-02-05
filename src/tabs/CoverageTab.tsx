/**
 * Location: src/tabs/CoverageTab.tsx
 */
import React, { useState, useMemo, useEffect, useRef } from "react";
import ClusterAnalysisEngine, {
  AnalysisConfig,
} from "../lib/ClusterAnalysisEngine";
import {
  Layers,
  AlertTriangle,
  RefreshCw,
  GitMerge,
  Settings,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  CheckCircle2,
  Trash2,
  MoreVertical,
  Archive,
  Download,
  HelpCircle,
  X as XIcon,
  Magnet,
  Wind,
  Plus,
  CheckSquare,
  Square,
  Search,
  AlertCircle,
  Wand2,
  Database,
  MoreHorizontal,
  FileJson,
  ArrowRight,
  PlayCircle,
  FileText,
  Save,
  UploadCloud,
  Scissors,
  MessageSquare,
  Info,
  Filter as FilterIcon,
  CornerUpRight,
  ListFilter,
} from "lucide-react";

// --- CONSTANTS & STYLES ---
const cellP: React.CSSProperties = { padding: "12px 10px" };

const tabStyle = (active: boolean): React.CSSProperties => ({
  background: "none",
  border: "none",
  padding: "8px 16px",
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 12,
  color: active ? "#ea580c" : "#64748b",
  borderBottom: active ? "2px solid #ea580c" : "none",
});

const StatCard = ({ title, val, color, icon }: any) => (
  <div
    style={{
      background: "#fff",
      padding: 16,
      borderRadius: 12,
      border: "1px solid #e2e8f0",
      display: "flex",
      alignItems: "center",
      gap: 16,
    }}
  >
    <div style={{ background: `${color}15`, padding: 10, borderRadius: 8 }}>
      {React.cloneElement(icon, { color })}
    </div>
    <div>
      <div style={{ fontSize: 10, color: "#64748b", fontWeight: 800 }}>
        {title}
      </div>
      <div style={{ fontSize: 18, fontWeight: 900 }}>{val}</div>
    </div>
  </div>
);

const SettingInput = ({
  label,
  val,
  setVal,
  min,
  max,
  step,
  fmt,
  desc,
}: any) => (
  <div>
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        marginBottom: 4,
      }}
    >
      <label style={{ fontSize: 11, fontWeight: 700 }}>{label}</label>
      <span style={{ fontSize: 11, color: "#3b82f6", fontWeight: 700 }}>
        {fmt(val)}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={val}
      onChange={(e) => setVal(parseFloat(e.target.value))}
      style={{ width: "100%", cursor: "pointer" }}
    />
    <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>{desc}</div>
  </div>
);

// --- MAIN COMPONENT ---
export default function NexusAuditSystem() {
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "duplication" | "master" | "review"
  >("dashboard");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [analysisData, setAnalysisData] = useState<any[]>([]);
  const [urlAnalysisData, setUrlAnalysisData] = useState<any[]>([]);
  const [engineInstance, setEngineInstance] =
    useState<ClusterAnalysisEngine | null>(null);

  // --- FILTERS ---
  const [healthFilter, setHealthFilter] = useState("All");
  const [actionFilter, setActionFilter] = useState("Pending");
  const [issueFilter, setIssueFilter] = useState("All");
  const [recFilter, setRecFilter] = useState("All");
  const [dupStatusFilter, setDupStatusFilter] = useState("All");
  const [clusterSearch, setClusterSearch] = useState("");

  // --- NEW: SWEEP & ORPHAN THRESHOLDS ---
  const [sweepThreshold, setSweepThreshold] = useState(0.8);
  const [orphanMatchThreshold, setOrphanMatchThreshold] = useState(0.8);
  const [orphanFilterMode, setOrphanFilterMode] = useState<
    "matches" | "unmatched"
  >("matches");

  // --- MASTER INDEX FILTERS ---
  const [masterSearch, setMasterSearch] = useState("");
  const [masterClusterFilter, setMasterClusterFilter] = useState("All");

  const [showSettings, setShowSettings] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Accordion State
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({
    Sunset: true,
    Merge: true,
    Keep: false,
    Pruned: true,
    Rehomed: true, // New section
  });

  const projectInputRef = useRef<HTMLInputElement>(null);

  const [config, setConfig] = useState<AnalysisConfig>({
    maxDupRate: 0.3,
    minAvgScore: 0.81,
    mergeThreshold: 0.5,
    vectorThreshold: 0.92,
    minUrlCount: 10,
    magnetMinScore: 0.82,
    magnetMaxCurrentScore: 0.93,
  });

  // --- INTERACTIVE STATE ---
  const [acceptedOverlaps, setAcceptedOverlaps] = useState<
    Record<string, boolean>
  >({});
  const [mergedClusters, setMergedClusters] = useState<Record<string, string>>(
    {}
  );
  const [rehomedCount, setRehomedCount] = useState(0);
  const [optimizedClusters, setOptimizedClusters] = useState<Set<string>>(
    new Set()
  );
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [changeComments, setChangeComments] = useState<Record<string, string>>(
    {}
  );

  // Track tools used per cluster permanently
  const [toolsUsedMap, setToolsUsedMap] = useState<
    Record<string, { magnet: boolean; drift: boolean }>
  >({});
  // Track orphan reassignments for changelog
  const [reassignedOrphans, setReassignedOrphans] = useState<
    Record<string, string>
  >({});

  const [prunedUrls, setPrunedUrls] = useState<Set<string>>(new Set());

  // Modal States
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [activeMergeCluster, setActiveMergeCluster] = useState<any>(null);
  const [customMergeTarget, setCustomMergeTarget] = useState("");

  const [magnetModalOpen, setMagnetModalOpen] = useState(false);
  const [magnetCluster, setMagnetCluster] = useState<string>("");
  const [magnetCandidates, setMagnetCandidates] = useState<any[]>([]);
  const [selectedMagnetUrls, setSelectedMagnetUrls] = useState<Set<string>>(
    new Set()
  );
  const [isDriftMode, setIsDriftMode] = useState(false);
  const [isCopyMode, setIsCopyMode] = useState(false);
  const [driftChoices, setDriftChoices] = useState<
    Record<string, { remove: boolean; add: boolean }>
  >({});
  const [keepOriginalUrls, setKeepOriginalUrls] = useState<Set<string>>(
    new Set()
  );

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [activeAssignUrl, setActiveAssignUrl] = useState<any>(null);
  const [assignSuggestions, setAssignSuggestions] = useState<any[]>([]);

  // NEW: Manual Search State
  const [manualAssignSearch, setManualAssignSearch] = useState("");

  const [rawRows, setRawRows] = useState<any[]>([]);

  useEffect(() => {
    const handleClickOutside = () => {
      setActiveMenu(null);
      setShowExportMenu(false);
    };
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  useEffect(() => {
    const runAnalysis = async () => {
      if (rawRows.length > 0) {
        setIsProcessing(true);
        const engine = new ClusterAnalysisEngine(rawRows);
        const results = await engine.process(config, (step) =>
          setProgressMsg(step)
        );
        setEngineInstance(engine);

        setAnalysisData((prevData) => {
          if (prevData.length === 0) return results;
          const prevMap = new Map(prevData.map((p) => [p.cluster_name, p]));
          return results.map((newRow) => {
            const prevRow = prevMap.get(newRow.cluster_name);
            if (prevRow && prevRow.original_score) {
              return {
                ...newRow,
                original_score: prevRow.original_score,
                optimizationSuccess: prevRow.optimizationSuccess,
                // toolsUsed will be merged from toolsUsedMap in processedData
              };
            }
            return newRow;
          });
        });

        if (urlAnalysisData.length === 0) {
          setUrlAnalysisData(engine.getDeepUrlAnalysis());
        }

        setIsProcessing(false);
        setProgressMsg("");
      }
    };
    runAnalysis();
  }, [config, rawRows]);

  // --- LOGIC ---
  const toggleOverlapAcceptance = (clusterName: string) => {
    setAcceptedOverlaps((prev) => {
      const next = { ...prev };
      if (next[clusterName]) delete next[clusterName];
      else next[clusterName] = true;
      return next;
    });
  };

  const updateComment = (key: string, text: string) => {
    setChangeComments((prev) => ({ ...prev, [key]: text }));
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const pruneUrl = (url: string) => {
    setPrunedUrls((prev) => {
      const next = new Set(prev);
      next.add(url);
      return next;
    });
    setAssignModalOpen(false);
  };

  const undoPrune = (url: string) => {
    setPrunedUrls((prev) => {
      const next = new Set(prev);
      next.delete(url);
      return next;
    });
  };

  const undoRehome = (url: string) => {
    // Remove from reassignedOrphans
    const target = reassignedOrphans[url];
    if (target) {
      const next = { ...reassignedOrphans };
      delete next[url];
      setReassignedOrphans(next);
      // Also remove assignment from data
      removeUrlAssignment(url, target);
    }
  };

  const openMergeModal = (cluster: any) => {
    setActiveMergeCluster(cluster);
    setCustomMergeTarget(cluster.target_cluster || "");
    setMergeModalOpen(true);
    setActiveMenu(null);
  };

  const runMagnetScan = (clusterName: string) => {
    if (!engineInstance) return;
    setMagnetCluster(clusterName);
    setIsDriftMode(false);

    // Reset Global Copy Mode to false (Default to Move)
    setIsCopyMode(false);

    const found = engineInstance.findMissedOpportunities(
      clusterName,
      config.magnetMinScore,
      config.magnetMaxCurrentScore
    );
    setMagnetCandidates(found);

    // Select ALL by default
    setSelectedMagnetUrls(new Set(found.map((c) => c.url)));

    // Auto-select "Keep Old" only for very high scoring items (> 0.81)
    const autoKeepSet = new Set<string>();
    found.forEach((c) => {
      if (c.current_score > 0.81) {
        autoKeepSet.add(c.url);
      }
    });
    setKeepOriginalUrls(autoKeepSet);

    setMagnetModalOpen(true);
  };

  const runDriftScan = (clusterName: string) => {
    if (!engineInstance) return;
    setMagnetCluster(clusterName);
    setIsDriftMode(true);
    const found = engineInstance.calculateDrift(
      clusterName,
      config.minAvgScore
    );
    setMagnetCandidates(found);

    const initialChoices: any = {};
    found.forEach((c) => {
      // Default: Suggest Remove = True
      initialChoices[c.url] = { remove: true, add: !!c.suggested_cluster };
    });
    setDriftChoices(initialChoices);
    setMagnetModalOpen(true);
  };

  const toggleMagnetSelection = (url: string) => {
    const newSet = new Set(selectedMagnetUrls);
    if (newSet.has(url)) newSet.delete(url);
    else newSet.add(url);
    setSelectedMagnetUrls(newSet);
  };

  const handleGlobalCopyToggle = () => {
    const newMode = !isCopyMode;
    setIsCopyMode(newMode);

    // Update all rows to match global toggle
    const newKeepSet = new Set<string>();
    if (newMode) {
      magnetCandidates.forEach((c) => newKeepSet.add(c.url));
    }
    setKeepOriginalUrls(newKeepSet);
  };

  const toggleKeepSelection = (url: string) => {
    const newSet = new Set(keepOriginalUrls);
    if (newSet.has(url)) newSet.delete(url);
    else newSet.add(url);
    setKeepOriginalUrls(newSet);
  };

  const toggleDriftChoice = (url: string, type: "remove" | "add") => {
    setDriftChoices((prev) => ({
      ...prev,
      [url]: { ...prev[url], [type]: !prev[url][type] },
    }));
  };

  const openAssignModal = (urlRow: any) => {
    if (!engineInstance) return;
    setActiveAssignUrl(urlRow);
    setManualAssignSearch(""); // Reset search on open

    let embedding = urlRow.assignments?.[0]?.embedding;
    if (!embedding || embedding.length === 0) {
      const raw = engineInstance.rawData.find(
        (r) => r.url === urlRow.url && r.embedding && r.embedding.length > 0
      );
      if (raw) embedding = raw.embedding;
    }

    const suggestions: any[] = [];
    if (embedding && embedding.length > 0) {
      engineInstance.clusters.forEach((cluster, name) => {
        if (mergedClusters[name]) return;
        if (cluster.centroid.length === 0) return;

        const score = engineInstance.cosineSimilarity(
          embedding,
          cluster.centroid
        );
        if (score > 0.5) {
          suggestions.push({ name, score });
        }
      });
    }
    setAssignSuggestions(
      suggestions.sort((a, b) => b.score - a.score).slice(0, 5)
    );
    setAssignModalOpen(true);
  };

  // --- HELPER: Find Best Match for Orphan ---
  const getBestMatchForOrphan = (urlRow: any) => {
    if (!engineInstance) return null;

    let embedding = urlRow.assignments?.[0]?.embedding;
    if (!embedding || embedding.length === 0) {
      const raw = engineInstance.rawData.find((r) => r.url === urlRow.url);
      if (raw) embedding = raw.embedding;
    }

    if (!embedding || embedding.length === 0) return null;

    let bestCluster = null;
    let bestScore = -1;

    engineInstance.clusters.forEach((cluster, name) => {
      if (mergedClusters[name]) return; // Skip sunset clusters
      if (cluster.centroid.length === 0) return;

      const score = engineInstance.cosineSimilarity(
        embedding,
        cluster.centroid
      );
      if (score > bestScore) {
        bestScore = score;
        bestCluster = name;
      }
    });

    if (bestCluster) {
      return { name: bestCluster, score: bestScore };
    }
    return null;
  };

  const addNewAssignment = (
    url: string,
    clusterName: string,
    score: number
  ) => {
    // Check if it was an orphan
    const currentUrlObj = urlAnalysisData.find((u) => u.url === url);
    if (currentUrlObj) {
      const activeAssignments = currentUrlObj.assignments.filter(
        (a: any) => !mergedClusters[a.cluster]
      );
      if (activeAssignments.length === 0) {
        // It was an orphan, record this action
        setReassignedOrphans((prev) => ({ ...prev, [url]: clusterName }));
      }
    }

    setUrlAnalysisData((prev) =>
      prev.map((row) => {
        if (row.url !== url) return row;
        const newAssignments = [
          ...row.assignments,
          { cluster: clusterName, score },
        ];
        newAssignments.sort((a: any, b: any) => b.score - a.score);
        const activeCount = newAssignments.filter(
          (a) => !mergedClusters[a.cluster]
        ).length;
        return { ...row, count: activeCount, assignments: newAssignments };
      })
    );
    setRehomedCount((prev) => prev + 1);
    setAssignModalOpen(false);
  };

  // --- BATCH ORPHAN ACTIONS ---
  const batchAcceptOrphans = () => {
    if (
      !confirm(
        `Assign all ${filteredOrphans.length} orphans to their suggested clusters?`
      )
    )
      return;

    const newReassigned = { ...reassignedOrphans };

    setUrlAnalysisData((prev) =>
      prev.map((row) => {
        // Is this row in our filtered orphans list?
        const isTarget = filteredOrphans.some((o) => o.url === row.url);
        if (!isTarget) return row;

        const best = getBestMatchForOrphan(row);
        if (!best) return row;

        newReassigned[row.url] = best.name;

        const newAssignments = [
          ...row.assignments,
          { cluster: best.name, score: best.score },
        ];
        newAssignments.sort((a: any, b: any) => b.score - a.score);

        const activeCount = newAssignments.filter(
          (a) => !mergedClusters[a.cluster]
        ).length;

        return { ...row, count: activeCount, assignments: newAssignments };
      })
    );

    setReassignedOrphans(newReassigned);
    setRehomedCount((prev) => prev + filteredOrphans.length);
  };

  const batchPruneOrphans = () => {
    if (
      !confirm(
        `Prune (Delete) all ${filteredOrphans.length} displayed orphans?`
      )
    )
      return;

    setPrunedUrls((prev) => {
      const next = new Set(prev);
      filteredOrphans.forEach((o) => next.add(o.url));
      return next;
    });
  };

  // --- FIXED: SYNCHRONOUS ENGINE UPDATE ---
  const confirmMagnetMove = () => {
    if (!engineInstance) return;

    const candidatesToProcess = magnetCandidates.filter(
      (c) => isDriftMode || selectedMagnetUrls.has(c.url)
    );

    const updates = new Map<string, any[]>();
    const affectedClusters = new Set<string>();
    affectedClusters.add(magnetCluster);
    let movedCount = 0;

    // Save tool usage state
    setToolsUsedMap((prev) => ({
      ...prev,
      [magnetCluster]: {
        ...(prev[magnetCluster] || {}),
        [isDriftMode ? "drift" : "magnet"]: true,
      },
    }));

    // 1. Calculate moves & Mutate Engine Synchronously
    urlAnalysisData.forEach((row) => {
      const candidate = candidatesToProcess.find((c) => c.url === row.url);
      if (!candidate) return;

      let newAssignments = [...row.assignments];
      let modified = false;

      if (isDriftMode) {
        const choice = driftChoices[row.url];
        if (!choice) return;

        if (choice.remove) {
          newAssignments = newAssignments.filter(
            (a) => a.cluster !== magnetCluster
          );
          const clusterObj = engineInstance.clusters.get(magnetCluster);
          if (clusterObj) {
            clusterObj.urls = clusterObj.urls.filter((u) => u.url !== row.url);
            if (clusterObj.urlSet) clusterObj.urlSet.delete(row.url);
          }
          modified = true;
        }

        if (choice.add && candidate.suggested_cluster) {
          newAssignments.push({
            cluster: candidate.suggested_cluster,
            score: candidate.suggested_score,
            embedding: candidate.embedding,
          });
          affectedClusters.add(candidate.suggested_cluster);
          const suggObj = engineInstance.clusters.get(
            candidate.suggested_cluster
          );
          if (suggObj) {
            suggObj.urls.push({
              url: row.url,
              score: candidate.suggested_score,
              embedding: candidate.embedding,
            });
            if (suggObj.urlSet) suggObj.urlSet.add(row.url);
          }
          modified = true;
        }
      } else {
        if (!selectedMagnetUrls.has(row.url)) return;
        const shouldKeep = keepOriginalUrls.has(row.url);

        if (!shouldKeep) {
          const oldCluster = candidate.current_cluster;
          newAssignments = newAssignments.filter(
            (a) => a.cluster !== oldCluster
          );
          if (oldCluster && oldCluster !== "Unassigned") {
            affectedClusters.add(oldCluster);
            const srcObj = engineInstance.clusters.get(oldCluster);
            if (srcObj) {
              srcObj.urls = srcObj.urls.filter((u) => u.url !== row.url);
              if (srcObj.urlSet) srcObj.urlSet.delete(row.url);
            }
          }
        }

        if (!newAssignments.some((a) => a.cluster === magnetCluster)) {
          newAssignments.push({
            cluster: magnetCluster,
            score: candidate.new_score,
            embedding: candidate.embedding,
          });
          const targetObj = engineInstance.clusters.get(magnetCluster);
          if (targetObj) {
            if (!targetObj.urlSet.has(row.url)) {
              targetObj.urls.push({
                url: row.url,
                score: candidate.new_score,
                embedding: candidate.embedding,
              });
              targetObj.urlSet.add(row.url);
            }
          }
        }
        modified = true;
      }

      if (modified) {
        newAssignments.sort((a: any, b: any) => b.score - a.score);
        updates.set(row.url, newAssignments);
        movedCount++;
      }
    });

    // 2. Recalculate Stats (Now that Engine is mutated)
    const updatedStats: Record<string, any> = {};
    affectedClusters.forEach((cName) => {
      const stats = engineInstance.recalculateClusterStats(cName);
      if (stats) updatedStats[cName] = stats;
    });

    // 3. Update React States
    setUrlAnalysisData((prev) =>
      prev.map((row) => {
        if (updates.has(row.url)) {
          const newAssignments = updates.get(row.url);
          const activeCount = newAssignments.filter(
            (a: any) => !mergedClusters[a.cluster]
          ).length;
          return { ...row, assignments: newAssignments, count: activeCount };
        }
        return row;
      })
    );

    setAnalysisData((prev) =>
      prev.map((c) => {
        if (updatedStats[c.cluster_name]) {
          const s = updatedStats[c.cluster_name];

          let newHealth = "Healthy";
          let newIssue = "None";
          let newRec = "Healthy";
          let newIssues: string[] = [];
          const newTotal = s.total;
          const newScore = s.hasVector ? parseFloat(String(s.avg_score)) : 0;

          if (newTotal < 5) {
            newHealth = "Sunset";
            newIssue = "Low Volume";
            newRec = "Sunset";
            newIssues.push("Low Volume");
          } else if (newTotal < config.minUrlCount) {
            newHealth = "Review";
            newIssue = "Low Volume";
            newRec = "Review (Low Vol)";
            newIssues.push("Low Volume");
          }

          if (newScore < config.minAvgScore) {
            newHealth = "Review";
            newIssue = "Low Quality";
            newRec = "Review Quality";
            newIssues.push("Low Quality");
          }
          if (newIssues.length === 0) newIssues.push("None");

          return {
            ...c,
            total: newTotal,
            avg_score: s.hasVector ? s.avg_score : "N/A",
            health: newHealth,
            issue: newIssue,
            issues: newIssues,
            recommendation: newRec,
            toolsUsed: {
              ...c.toolsUsed,
              [isDriftMode ? "drift" : "magnet"]: true,
            },
          };
        }
        return c;
      })
    );

    setOptimizedClusters((prev) => {
      const next = new Set(prev);
      next.add(magnetCluster);
      return next;
    });
    setRehomedCount((prev) => prev + movedCount);
    setMagnetModalOpen(false);
  };

  const executeAction = (sourceCluster: any, targetName: string) => {
    const sourceName = sourceCluster.cluster_name || sourceCluster.name;
    setMergedClusters((prev) => ({ ...prev, [sourceName]: targetName }));
    setUrlAnalysisData((prevData) => {
      return prevData.map((row) => {
        const hasTag = row.assignments.some(
          (a: any) => a.cluster === sourceName
        );
        if (!hasTag) return row;
        let newAssignments = [...row.assignments];
        if (targetName !== "__DEPRECATED__") {
          const sourceScore =
            newAssignments.find((a) => a.cluster === sourceName)?.score || 0;
          newAssignments = newAssignments.filter(
            (a) => a.cluster !== sourceName
          );
          if (!newAssignments.some((a) => a.cluster === targetName)) {
            newAssignments.push({ cluster: targetName, score: sourceScore });
          }
        }
        const activeCount = newAssignments.filter((a) => {
          const status =
            a.cluster === sourceName ? targetName : mergedClusters[a.cluster];
          return status !== "__DEPRECATED__" && !status;
        }).length;
        return { ...row, count: activeCount, assignments: newAssignments };
      });
    });
    setMergeModalOpen(false);
    setActiveMenu(null);
  };

  const undoAction = (clusterName: string) => {
    setMergedClusters((prev) => {
      const next = { ...prev };
      delete next[clusterName];
      return next;
    });
  };

  const removeUrlAssignment = (url: string, clusterToRemove: string) => {
    setUrlAnalysisData((prev) =>
      prev
        .map((row) => {
          if (row.url !== url) return row;
          const newAssignments = row.assignments.filter(
            (a: any) => a.cluster !== clusterToRemove
          );
          const activeCount = newAssignments.filter(
            (a) => !mergedClusters[a.cluster]
          ).length;
          return { ...row, count: activeCount, assignments: newAssignments };
        })
        .filter((row) => row.assignments.length > 0)
    );
  };

  const downloadManifest = () => {
    const rows = [
      ["Action Item", "Who", "Resource/Sheet"],
      ["Bulk Reassign Blog Tags to URLs", "Devs", "Clean Data (CSV)"],
      ["Prune URLs", "Blog Growth Team", "Prune List (CSV)"],
      ["Redirect Pruned URLs", "Blog Growth Team", "Redirect Map (CSV)"],
      ["Execute Sunset & Merge Logic", "Content/SEO", "Action Plan (CSV)"],
    ];

    const csvContent =
      "data:text/csv;charset=utf-8," +
      rows.map((e) => e.map((c) => `"${c}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", "nexus_action_manifest.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadPruneList = () => {
    const rows = [["URL", "Status"]];
    prunedUrls.forEach((url) => rows.push([url, "PRUNE"]));

    const csvContent =
      "data:text/csv;charset=utf-8," +
      rows.map((e) => e.map((c) => `"${c}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", "nexus_prune_list.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadRedirectMap = () => {
    if (!engineInstance) return;

    const rows = [["Source URL", "Recommended Redirect (Cluster)"]];

    prunedUrls.forEach((url) => {
      const urlObj = urlAnalysisData.find((u) => u.url === url);
      let embedding = urlObj?.assignments?.[0]?.embedding;

      if (!embedding) {
        const raw = engineInstance.rawData.find((r) => r.url === url);
        if (raw) embedding = raw.embedding;
      }

      let bestCluster = "Homepage / 404";
      let bestScore = -1;

      if (embedding && embedding.length > 0) {
        engineInstance.clusters.forEach((cluster, name) => {
          if (mergedClusters[name]) return;
          if (cluster.centroid.length === 0) return;

          const score = engineInstance.cosineSimilarity(
            embedding,
            cluster.centroid
          );
          if (score > bestScore) {
            bestScore = score;
            bestCluster = name;
          }
        });
      }

      rows.push([url, bestCluster]);
    });

    const csvContent =
      "data:text/csv;charset=utf-8," +
      rows.map((e) => e.map((c) => `"${c}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", "nexus_redirect_map.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadActionPlan = () => {
    const rows = [
      [
        "Source Cluster",
        "Action",
        "Target Cluster",
        "Implementation Instructions",
        "Notes/Comments",
      ],
    ];
    Object.entries(mergedClusters).forEach(([source, target]) => {
      const isDeprecate = target === "__DEPRECATED__";
      const action = isDeprecate ? "SUNSET" : "MERGE";
      const tgt = isDeprecate ? "-" : target;
      let instruction = isDeprecate
        ? `Sunset tag '${source}'.`
        : `Redirect '/topic/${source.toLowerCase()}' to '/topic/${target.toLowerCase()}'.`;

      const comment = changeComments[source] || "";
      rows.push([source, action, tgt, instruction, comment]);
    });
    Object.entries(reassignedOrphans).forEach(([url, target]) => {
      rows.push([
        url,
        "RE-HOME",
        target,
        "Assign URL to new topic cluster",
        "Orphan Reassignment",
      ]);
    });
    Object.keys(acceptedOverlaps).forEach((source) =>
      rows.push([source, "KEEP", "-", "Verified.", ""])
    );
    const csvContent =
      "data:text/csv;charset=utf-8," +
      rows.map((e) => e.map((c) => `"${c}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", "nexus_final_action_plan.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- REFACTORED CSV EXPORT (Fixes Syntax Error) ---
  const downloadCleanData = (includeEmbeddings: boolean) => {
    const headers = ["Address", "Tags"];
    if (includeEmbeddings) headers.push("Embedding");

    const rows = [headers];

    urlAnalysisData.forEach((row) => {
      if (prunedUrls.has(row.url)) return;

      const activeAssignments = row.assignments
        .filter((a: any) => !mergedClusters[a.cluster])
        .map((a: any) => a.cluster)
        .join("; ");

      if (activeAssignments) {
        const rowData = [row.url, activeAssignments];
        if (includeEmbeddings) {
          const embedding = row.assignments[0]?.embedding || [];
          const embeddingStr =
            embedding.length > 0 ? `[${embedding.join(",")}]` : "[]";
          rowData.push(embeddingStr);
        }
        rows.push(rowData);
      }
    });

    const csvRows = rows.map((r) => {
      return r
        .map((c) => {
          const str = String(c).replace(/"/g, '""');
          return `"${str}"`;
        })
        .join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");

    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute(
      "download",
      includeEmbeddings
        ? "nexus_clean_data_full.csv"
        : "nexus_clean_data_simple.csv"
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const saveProjectState = () => {
    const projectState = {
      version: 5,
      date: new Date().toISOString(),
      config,
      mergedClusters,
      acceptedOverlaps,
      rehomedCount,
      optimizedClusters: Array.from(optimizedClusters),
      prunedUrls: Array.from(prunedUrls),
      analysisData, // Saves toolsUsed and original_score
      changeComments,
      toolsUsedMap, // NEW: Save this
      reassignedOrphans, // NEW: Save this
      assignments: urlAnalysisData.map((u) => ({
        u: u.url,
        a: u.assignments.map((as: any) => ({ c: as.cluster, s: as.score })),
      })),
    };
    const blob = new Blob([JSON.stringify(projectState)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `nexus_project_${
      new Date().toISOString().split("T")[0]
    }.nexus`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const loadProjectState = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = "";

    if (!engineInstance || rawRows.length === 0) {
      alert(
        "Please upload your Raw Audit CSV first. Project files apply changes on top of the raw data."
      );
      return;
    }

    setIsProcessing(true);
    setProgressMsg("Restoring project state...");

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);

        if (json.config) setConfig(json.config);
        if (json.mergedClusters) setMergedClusters(json.mergedClusters);
        if (json.acceptedOverlaps) setAcceptedOverlaps(json.acceptedOverlaps);
        if (json.rehomedCount) setRehomedCount(json.rehomedCount);
        if (json.optimizedClusters)
          setOptimizedClusters(new Set(json.optimizedClusters));
        if (json.prunedUrls) setPrunedUrls(new Set(json.prunedUrls));
        if (json.changeComments) setChangeComments(json.changeComments);
        if (json.toolsUsedMap) setToolsUsedMap(json.toolsUsedMap); // RESTORE
        if (json.reassignedOrphans)
          setReassignedOrphans(json.reassignedOrphans); // RESTORE

        if (json.analysisData) setAnalysisData(json.analysisData);

        if (json.assignments && Array.isArray(json.assignments)) {
          const rawMap = new Map(engineInstance.rawData.map((r) => [r.url, r]));

          const restoredData = json.assignments.map((saved: any) => {
            const original = rawMap.get(saved.u);
            const embedding = original?.embedding || [];

            const restoredAssignments = saved.a.map((as: any) => ({
              cluster: as.c,
              score: as.s,
              embedding: embedding,
            }));

            const activeCount = restoredAssignments.filter(
              (a: any) => !json.mergedClusters[a.cluster]
            ).length;

            return {
              url: saved.u,
              count: activeCount,
              assignments: restoredAssignments,
              status: {},
              lowest: restoredAssignments[restoredAssignments.length - 1],
            };
          });

          setUrlAnalysisData(restoredData);

          setTimeout(() => {
            setIsProcessing(false);
            setProgressMsg("");
            alert("Project state restored successfully.");
          }, 500);
        } else {
          setIsProcessing(false);
        }
      } catch (err) {
        console.error(err);
        setIsProcessing(false);
        alert("Error loading project file. Invalid format.");
      }
    };
    reader.readAsText(file);
  };

  const handleAuditUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const csvText = event.target?.result as string;
      const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) return setIsProcessing(false);
      const headerRaw = lines[0].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      const header = headerRaw.map((h) =>
        h.trim().replace(/^"|"$/g, "").toLowerCase()
      );
      const cIdx = header.findIndex(
        (h) => h.includes("tag") || h.includes("cluster")
      );
      const uIdx = header.findIndex(
        (h) => h.includes("url") || h.includes("address")
      );
      const sIdx = header.findIndex(
        (h) => h.includes("semantic") || h.includes("score")
      );
      const eIdx = header.findIndex(
        (h) => h.includes("extract") || h.includes("embedding")
      );
      const parsedRows: any[] = [];
      lines.slice(1).forEach((l) => {
        const parts = l.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        const rawClusterString = parts[cIdx]?.replace(/^"|"$/g, "").trim();
        const rawUrl = parts[uIdx]?.replace(/^"|"$/g, "").trim();
        let embedding: number[] = [];
        if (parts[eIdx]) {
          const rawVector = parts[eIdx]
            .replace(/^"|"$/g, "")
            .replace(/[\[\]]/g, "");
          if (rawVector.trim().length > 0)
            embedding = rawVector
              .split(",")
              .map(Number)
              .filter((n) => !isNaN(n));
        }
        if (!rawUrl || !rawClusterString) return;
        rawClusterString
          .split(";")
          .map((t) => t.trim().replace(/^["']|["']$/g, ""))
          .filter(
            (t) =>
              !["(no value)", "no value", "null", "undefined"].includes(
                t.toLowerCase()
              )
          )
          .forEach((tag) => {
            parsedRows.push({
              cluster_name: tag,
              url: rawUrl.toLowerCase(),
              semantic_score: parseFloat(parts[sIdx]) || 0,
              embedding,
            });
          });
      });
      setRawRows(parsedRows);
    };
    reader.readAsText(file);
  };

  const handleAcceptAll = () => {
    if (
      !confirm(
        `Are you sure you want to approve all ${filteredData.length} visible items?`
      )
    )
      return;
    const newAccepted = { ...acceptedOverlaps };
    filteredData.forEach((row) => {
      if (
        mergedClusters[row.cluster_name] ||
        acceptedOverlaps[row.cluster_name]
      )
        return;

      if (row.health === "Sunset") {
        if (row.recommendation?.includes("Merge") && row.target_cluster) {
          executeAction(row, row.target_cluster);
        } else {
          executeAction(row, "__DEPRECATED__");
        }
      } else if (row.target_cluster) {
        executeAction(row, row.target_cluster);
      } else {
        newAccepted[row.cluster_name] = true;
      }
    });
    setAcceptedOverlaps(newAccepted);
  };

  const kpiMetrics = useMemo(() => {
    if (analysisData.length === 0)
      return { total: 0, healthy: 0, review: 0, merged: 0, deprecated: 0 };
    let healthy = 0,
      review = 0,
      merged = 0,
      deprecated = 0;
    analysisData.forEach((c) => {
      const name = c.cluster_name;
      if (mergedClusters[name]) {
        if (mergedClusters[name] === "__DEPRECATED__") deprecated++;
        else merged++;
        return;
      }
      if (acceptedOverlaps[name]) {
        healthy++;
        return;
      }
      if (c.health === "Healthy") healthy++;
      else review++;
    });
    return { total: analysisData.length, healthy, review, merged, deprecated };
  }, [analysisData, acceptedOverlaps, mergedClusters]);

  // --- NEW: LIVE STATS CALCULATION FOR SOURCE OF TRUTH ---
  const liveClusterStats = useMemo(() => {
    const stats = new Map<string, { count: number; shared: number }>();

    // 1. Init all clusters with 0
    analysisData.forEach((c) => {
      stats.set(c.cluster_name, { count: 0, shared: 0 });
    });

    // 2. Count active URLs from Master Index
    urlAnalysisData.forEach((u) => {
      if (prunedUrls.has(u.url)) return;
      const activeAssignments = u.assignments.filter(
        (a: any) => !mergedClusters[a.cluster]
      );

      activeAssignments.forEach((a: any) => {
        if (!stats.has(a.cluster)) {
          // New cluster found (created via drift/magnet?)
          stats.set(a.cluster, { count: 0, shared: 0 });
        }
        const s = stats.get(a.cluster)!;
        s.count++;
        if (activeAssignments.length > 1) s.shared++;
      });
    });

    return stats;
  }, [urlAnalysisData, mergedClusters, prunedUrls, analysisData]);

  // --- UPDATED: PULL TOTALS FROM LIVE STATS & MERGE TOOLS USED ---
  const processedData = useMemo(() => {
    return analysisData.map((m) => {
      const row = { ...m };

      // INJECT LIVE STATS
      const live = liveClusterStats.get(row.cluster_name);
      if (live) {
        row.total = live.count;
        row.shared = live.shared;
        row.dup_percent =
          row.total > 0
            ? ((row.shared / row.total) * 100).toFixed(1) + "%"
            : "0.0%";

        // RE-EVALUATE HEALTH BASED ON NEW COUNT
        if (!mergedClusters[row.cluster_name]) {
          if (row.total >= config.minUrlCount && row.health !== "Healthy") {
            const score = parseFloat(row.avg_score);
            if (
              row.issue === "Low Volume" ||
              row.health === "Sunset" ||
              row.health === "Deprecated"
            ) {
              if (isNaN(score) || score >= config.minAvgScore) {
                row.health = "Healthy";
                row.issue = "None";
                row.issues = ["None"];
                row.recommendation = "Healthy";
              }
            }
          }
        }
      }

      // Merge Tool Icons from Persistent State
      if (toolsUsedMap[row.cluster_name]) {
        row.toolsUsed = { ...row.toolsUsed, ...toolsUsedMap[row.cluster_name] };
      }

      if (!row.issues) {
        row.issues = row.issue ? [row.issue] : ["None"];
      }

      if (acceptedOverlaps[row.cluster_name]) {
        row.health = "Healthy";
        row.issue = "None";
        row.issues = ["None"];
        row.recommendation = "Verified / Ignored";
      }
      return row;
    });
  }, [
    analysisData,
    liveClusterStats,
    acceptedOverlaps,
    config,
    mergedClusters,
    toolsUsedMap,
  ]);

  const filteredData = useMemo(() => {
    return processedData.filter((m) => {
      if (
        clusterSearch &&
        !m.cluster_name.toLowerCase().includes(clusterSearch.toLowerCase())
      ) {
        return false;
      }

      const isAccepted = acceptedOverlaps[m.cluster_name];
      const isMerged = mergedClusters[m.cluster_name];

      // FORCE HEALTHY if ignored, ensuring it doesn't show in Review filter
      let effectiveHealth = isAccepted ? "Healthy" : m.health;

      if (healthFilter !== "All" && effectiveHealth !== healthFilter)
        return false;

      if (actionFilter === "Pending") {
        if (isMerged) return false;
      }

      if (actionFilter === "Merge") {
        if (isAccepted || isMerged) return false;
        if (!m.recommendation?.includes("Merge")) return false;
      }

      if (actionFilter === "Ignore") {
        if (!isAccepted) return false;
      }

      if (actionFilter === "Resolved" && !isMerged) return false;

      if (issueFilter !== "All") {
        if (!m.issues.includes(issueFilter)) return false;
      }

      if (recFilter !== "All") {
        if (isAccepted) {
          if (
            recFilter === "Review Quality" &&
            m.recommendation !== "Review Quality"
          )
            return false;
          if (
            recFilter !== "Review Quality" &&
            !m.recommendation?.includes(recFilter)
          )
            return false;
        } else {
          if (recFilter === "Review Quality") {
            if (m.recommendation !== "Review Quality" && !m.optimizationSuccess)
              return false;
          } else if (!m.recommendation?.includes(recFilter)) return false;
        }
      }

      return true;
    });
  }, [
    processedData,
    healthFilter,
    actionFilter,
    issueFilter,
    recFilter,
    acceptedOverlaps,
    mergedClusters,
    clusterSearch,
  ]);

  const filteredUrlData = useMemo(() => {
    return urlAnalysisData.filter((v: any) => {
      if (prunedUrls.has(v.url)) return false;
      const activeCount = v.assignments.filter(
        (a: any) => !mergedClusters[a.cluster]
      ).length;

      // --- NEW: SWEEP FILTER LOGIC ---
      const hasWeakMatch = v.assignments.some(
        (a: any) => !mergedClusters[a.cluster] && a.score < sweepThreshold
      );

      if (dupStatusFilter === "Weak Matches (< 80%)") {
        return hasWeakMatch;
      }

      if (dupStatusFilter === "All") return true;
      if (dupStatusFilter === "2 Clusters") return activeCount === 2;
      if (dupStatusFilter === "3-4 Clusters")
        return activeCount >= 3 && activeCount <= 4;
      if (dupStatusFilter === "5+ Clusters") return activeCount >= 5;
      return true;
    });
  }, [
    urlAnalysisData,
    dupStatusFilter,
    mergedClusters,
    prunedUrls,
    sweepThreshold,
  ]);

  const masterIndexData = useMemo(() => {
    return urlAnalysisData.filter((v: any) => {
      if (masterSearch && !v.url.includes(masterSearch.toLowerCase()))
        return false;
      if (masterClusterFilter !== "All") {
        if (
          !v.assignments.some(
            (a: any) =>
              a.cluster === masterClusterFilter && !mergedClusters[a.cluster]
          )
        )
          return false;
      }
      return true;
    });
  }, [urlAnalysisData, masterSearch, masterClusterFilter, mergedClusters]);

  const reviewData = useMemo(() => {
    const grouped: Record<string, any[]> = {
      Sunset: [],
      Merge: [],
      Keep: [],
      Pruned: [],
      Rehomed: [], // NEW SECTION
    };

    const clusterStats = new Map(analysisData.map((c) => [c.cluster_name, c]));

    Object.entries(mergedClusters).forEach(([source, target]) => {
      const stats = clusterStats.get(source);
      const urlCount = stats ? stats.total : "?";

      if (target === "__DEPRECATED__") {
        grouped.Sunset.push({ source, type: "Sunset", target: "-", urlCount });
      } else {
        grouped.Merge.push({ source, type: "Merge", target, urlCount });
      }
    });

    Object.keys(acceptedOverlaps).forEach((source) => {
      const stats = clusterStats.get(source);
      const urlCount = stats ? stats.total : "?";
      grouped.Keep.push({ source, type: "Keep", target: "-", urlCount });
    });

    prunedUrls.forEach((url) => {
      grouped.Pruned.push({
        source: url,
        type: "Prune",
        target: "-",
        urlCount: 1,
      });
    });

    // NEW: Populate Rehomed
    Object.entries(reassignedOrphans).forEach(([url, target]) => {
      grouped.Rehomed.push({
        source: url,
        type: "Re-home",
        target: target,
        urlCount: 1,
      });
    });

    return grouped;
  }, [
    mergedClusters,
    acceptedOverlaps,
    prunedUrls,
    analysisData,
    reassignedOrphans,
  ]);

  const orphans = useMemo(() => {
    return urlAnalysisData.filter((u) => {
      if (prunedUrls.has(u.url)) return false;
      const active = u.assignments.filter(
        (a: any) => !mergedClusters[a.cluster]
      ).length;
      return active === 0;
    });
  }, [urlAnalysisData, mergedClusters, prunedUrls]);

  // --- NEW: FILTERED ORPHANS FOR DISPLAY ---
  const filteredOrphans = useMemo(() => {
    const list =
      orphanFilterMode === "matches"
        ? orphans.filter((u) => {
            const match = getBestMatchForOrphan(u);
            return match && match.score >= orphanMatchThreshold;
          })
        : orphans.filter((u) => {
            const match = getBestMatchForOrphan(u);
            return !match || match.score < orphanMatchThreshold;
          });
    return list;
  }, [
    orphans,
    orphanMatchThreshold,
    engineInstance,
    mergedClusters,
    orphanFilterMode,
  ]);

  const workflowMetrics = useMemo(() => {
    let sunsetCount = 0;
    let mergeCount = 0;
    let qualityCount = 0;

    processedData.forEach((c) => {
      if (mergedClusters[c.cluster_name]) return;

      if (acceptedOverlaps[c.cluster_name] && c.health !== "Review") return;

      if (c.health === "Sunset" || c.recommendation?.includes("Sunset")) {
        sunsetCount++;
      } else if (c.recommendation?.includes("Merge")) {
        mergeCount++;
      } else if (c.recommendation === "Review Quality") {
        qualityCount++;
      }
    });
    return { sunsetCount, mergeCount, qualityCount };
  }, [processedData, mergedClusters, acceptedOverlaps]);

  const setStepFilter = (step: number) => {
    setHealthFilter("All");
    setActionFilter("Pending");
    setIssueFilter("All");
    setRecFilter("All");
    if (step === 1) setRecFilter("Sunset");
    else if (step === 2) setRecFilter("Merge");
    else if (step === 3) setRecFilter("Review Quality");
  };

  const renderIssueChip = (issue: string) => {
    const colors: any = {
      "Semantic Overlap": ["#e0e7ff", "#4338ca"],
      "Content Overlap": ["#ffedd5", "#c2410c"],
      "Low Quality": ["#fee2e2", "#b91c1c"],
      Fragmentation: ["#fef9c3", "#a16207"],
      "Low Volume": ["#f3f4f6", "#4b5563"],
      Isolation: ["#f1f5f9", "#475569"],
      "Intent Overlap": ["#f3e8ff", "#7e22ce"],
    };
    if (!colors[issue])
      return <span style={{ color: "#cbd5e1", fontSize: 10 }}>-</span>;
    return (
      <span
        style={{
          background: colors[issue][0],
          color: colors[issue][1],
          padding: "2px 6px",
          borderRadius: 4,
          fontWeight: 700,
          fontSize: 9,
        }}
      >
        {issue}
      </span>
    );
  };

  return (
    <div
      style={{
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 24,
        fontFamily: "sans-serif",
      }}
    >
      {/* --- INSTRUCTIONS PANEL --- */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          overflow: "hidden",
          marginBottom: -8,
        }}
      >
        <div
          onClick={() => setShowInstructions(!showInstructions)}
          style={{
            padding: "12px 16px",
            background: "#f8fafc",
            cursor: "pointer",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontWeight: 600,
            color: "#475569",
            fontSize: 13,
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <HelpCircle size={16} />
            Nexus Audit System: Workflow Guide
          </div>
          {showInstructions ? (
            <ChevronUp size={16} />
          ) : (
            <ChevronDown size={16} />
          )}
        </div>
        {showInstructions && (
          <div
            style={{
              padding: 16,
              fontSize: 12,
              color: "#475569",
              lineHeight: 1.6,
              borderTop: "1px solid #e2e8f0",
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr",
              gap: 24,
            }}
          >
            <div>
              <strong>1. Dashboard</strong> Consolidate your topics. Merge
              duplicates, deprecate low-value tags, and use Tools to refine
              clusters.
            </div>
            <div>
              <strong>2. Cluster Sweep</strong> Audit individual URLs. Ensure
              content isn't cross-listed across too many topics.
            </div>
            <div>
              <strong>3. Master Index</strong> Searchable database of your
              entire content library with live status updates.
            </div>
            <div>
              <strong>4. Final Review</strong> Sanity check your changes before
              exporting the final action plan CSV.
            </div>
          </div>
        )}
      </div>

      {/* --- STICKY TOP BAR --- */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "#f8fafc",
          paddingBottom: 16,
          borderBottom: "1px solid #e2e8f0",
          margin: "-24px -24px 0 -24px",
          padding: "24px 24px 16px 24px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={() => setActiveTab("dashboard")}
              style={tabStyle(activeTab === "dashboard")}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab("duplication")}
              style={tabStyle(activeTab === "duplication")}
            >
              Cluster Sweep and De-dup
            </button>
            <button
              onClick={() => setActiveTab("master")}
              style={tabStyle(activeTab === "master")}
            >
              Master URL Index
            </button>
            <button
              onClick={() => setActiveTab("review")}
              style={tabStyle(activeTab === "review")}
            >
              Final Review
            </button>
          </div>
          <div style={{ display: "flex", gap: 12, position: "relative" }}>
            {/* --- NEW: SAVE / LOAD PROJECT --- */}
            <button
              onClick={() => saveProjectState()}
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                background: "white",
                border: "1px solid #cbd5e1",
                borderRadius: 6,
                padding: "6px 12px",
                cursor: "pointer",
                fontSize: 12,
                color: "#64748b",
              }}
            >
              <Save size={14} /> Save Project
            </button>
            <button
              onClick={() => projectInputRef.current?.click()}
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                background: "white",
                border: "1px solid #cbd5e1",
                borderRadius: 6,
                padding: "6px 12px",
                cursor: "pointer",
                fontSize: 12,
                color: "#64748b",
              }}
            >
              <UploadCloud size={14} /> Load Project
            </button>
            <input
              type="file"
              ref={projectInputRef}
              style={{ display: "none" }}
              onChange={loadProjectState}
              accept=".json,.nexus"
            />

            {/* --- EXPORT DROPDOWN --- */}
            <div style={{ position: "relative" }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowExportMenu(!showExportMenu);
                }}
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  background: "white",
                  border: "1px solid #cbd5e1",
                  borderRadius: 6,
                  padding: "6px 12px",
                  cursor: "pointer",
                  fontSize: 12,
                  color: "#059669",
                  fontWeight: 600,
                }}
              >
                <FileJson size={14} /> Export Data{" "}
                {showExportMenu ? (
                  <ChevronUp size={12} />
                ) : (
                  <ChevronDown size={12} />
                )}
              </button>
              {showExportMenu && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    right: 0,
                    marginTop: 4,
                    background: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: 6,
                    boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                    minWidth: 200,
                    zIndex: 200,
                  }}
                >
                  <div
                    onClick={() => {
                      downloadManifest();
                      setShowExportMenu(false);
                    }}
                    style={{
                      padding: "10px 12px",
                      fontSize: 12,
                      color: "#334155",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      borderBottom: "1px solid #f1f5f9",
                      background: "#f0fdf4",
                    }}
                  >
                    <Archive size={14} color="#16a34a" />{" "}
                    <strong>Action Kit (ZIP Guide)</strong>
                  </div>
                  <div
                    onClick={() => {
                      downloadCleanData(false);
                      setShowExportMenu(false);
                    }}
                    style={{
                      padding: "8px 12px",
                      fontSize: 12,
                      color: "#334155",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      borderBottom: "1px solid #f1f5f9",
                    }}
                  >
                    <FileText size={14} /> Simple CSV{" "}
                    <span style={{ color: "#94a3b8", fontSize: 10 }}>
                      (No Vectors)
                    </span>
                  </div>
                  <div
                    onClick={() => {
                      downloadCleanData(true);
                      setShowExportMenu(false);
                    }}
                    style={{
                      padding: "8px 12px",
                      fontSize: 12,
                      color: "#334155",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      borderBottom: "1px solid #f1f5f9",
                    }}
                  >
                    <Database size={14} /> Full CSV{" "}
                    <span style={{ color: "#94a3b8", fontSize: 10 }}>
                      (With Vectors)
                    </span>
                  </div>
                  <div
                    onClick={() => {
                      downloadPruneList();
                      setShowExportMenu(false);
                    }}
                    style={{
                      padding: "8px 12px",
                      fontSize: 12,
                      color: "#b91c1c",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      borderBottom: "1px solid #f1f5f9",
                    }}
                  >
                    <Scissors size={14} /> Prune List ({prunedUrls.size})
                  </div>
                  <div
                    onClick={() => {
                      downloadRedirectMap();
                      setShowExportMenu(false);
                    }}
                    style={{
                      padding: "8px 12px",
                      fontSize: 12,
                      color: "#ea580c",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Wind size={14} /> Redirect Map
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={downloadActionPlan}
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                background: "white",
                border: "1px solid #cbd5e1",
                borderRadius: 6,
                padding: "6px 12px",
                cursor: "pointer",
                fontSize: 12,
                color: "#3b82f6",
                fontWeight: 600,
              }}
            >
              <Download size={14} /> Download Plan
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                background: "white",
                border: "1px solid #cbd5e1",
                borderRadius: 6,
                padding: "6px 12px",
                cursor: "pointer",
                fontSize: 12,
                color: "#64748b",
              }}
            >
              <Settings size={14} /> Settings
            </button>
          </div>
        </div>

        {showSettings && (
          <div
            style={{
              background: "white",
              padding: 16,
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
              gap: 24,
              marginBottom: 16,
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
            }}
          >
            <SettingInput
              label="Max Duplication Rate"
              val={config.maxDupRate}
              setVal={(v: number) => setConfig({ ...config, maxDupRate: v })}
              min={0}
              max={1}
              step={0.01}
              fmt={(v: number) => `${(v * 100).toFixed(0)}%`}
              desc="High dup % triggers Review."
            />
            <SettingInput
              label="Quality Threshold (Avg Score)"
              val={config.minAvgScore}
              setVal={(v: number) => setConfig({ ...config, minAvgScore: v })}
              min={0}
              max={1}
              step={0.01}
              fmt={(v: number) => v.toFixed(2)}
              desc="Low score triggers Review."
            />
            <SettingInput
              label="Merge Overlap %"
              val={config.mergeThreshold}
              setVal={(v: number) =>
                setConfig({ ...config, mergeThreshold: v })
              }
              min={0}
              max={1}
              step={0.05}
              fmt={(v: number) => `${(v * 100).toFixed(0)}%`}
              desc="Overlap needed to suggest Merge."
            />
            <SettingInput
              label="Vector Similarity"
              val={config.vectorThreshold}
              setVal={(v: number) =>
                setConfig({ ...config, vectorThreshold: v })
              }
              min={0}
              max={1}
              step={0.01}
              fmt={(v: number) => v.toFixed(2)}
              desc="AI Similarity needed to suggest Merge."
            />
            <SettingInput
              label="Min URLs per Cluster"
              val={config.minUrlCount}
              setVal={(v: number) => setConfig({ ...config, minUrlCount: v })}
              min={1}
              max={100}
              step={1}
              fmt={(v: number) => v}
              desc="Below this is Low Volume. (<5 is Deprecated)."
            />
            <SettingInput
              label="Magnet Min Score"
              val={config.magnetMinScore}
              setVal={(v: number) =>
                setConfig({ ...config, magnetMinScore: v })
              }
              min={0}
              max={1}
              step={0.01}
              fmt={(v: number) => v.toFixed(2)}
              desc="Min match to suggest move."
            />
            <SettingInput
              label="Magnet Max Current"
              val={config.magnetMaxCurrentScore}
              setVal={(v: number) =>
                setConfig({ ...config, magnetMaxCurrentScore: v })
              }
              min={0}
              max={1}
              step={0.01}
              fmt={(v: number) => v.toFixed(2)}
              desc="Only steal if current match is below this."
            />
          </div>
        )}

        {activeTab !== "review" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 16,
            }}
          >
            <StatCard
              title="REMAINING"
              val={String(
                kpiMetrics.total - kpiMetrics.merged - kpiMetrics.deprecated
              )}
              color="#64748b"
              icon={<Layers size={18} />}
            />
            <StatCard
              title="HEALTHY"
              val={String(kpiMetrics.healthy)}
              color="#34a853"
              icon={<CheckCircle2 size={18} />}
            />
            <StatCard
              title="NEED REVIEW"
              val={String(kpiMetrics.review)}
              color="#ea4335"
              icon={<AlertTriangle size={18} />}
            />
            <StatCard
              title="MERGED"
              val={String(kpiMetrics.merged)}
              color="#8b5cf6"
              icon={<GitMerge size={18} />}
            />
            <StatCard
              title="SUNSET"
              val={String(kpiMetrics.deprecated)}
              color="#94a3b8"
              icon={<Archive size={18} />}
            />
          </div>
        )}
      </div>

      {activeTab === "dashboard" && (
        <div
          style={{
            background: "#fff",
            padding: 24,
            borderRadius: 12,
            border: "1px solid #e2e8f0",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 20,
              padding: "10px 16px",
              background: "#f8fafc",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#64748b",
                textTransform: "uppercase",
                marginRight: 8,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <PlayCircle size={14} /> Suggested Workflow:
            </span>
            <button
              onClick={() => setStepFilter(1)}
              disabled={workflowMetrics.sunsetCount === 0}
              style={{
                background:
                  workflowMetrics.sunsetCount > 0 ? "#fff" : "#f1f5f9",
                border:
                  workflowMetrics.sunsetCount > 0
                    ? "1px solid #fca5a5"
                    : "1px solid #e2e8f0",
                color: workflowMetrics.sunsetCount > 0 ? "#b91c1c" : "#94a3b8",
                padding: "6px 12px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 6,
                cursor: workflowMetrics.sunsetCount > 0 ? "pointer" : "default",
                opacity: workflowMetrics.sunsetCount > 0 ? 1 : 0.6,
              }}
            >
              <Trash2 size={12} /> 1. Cleanup ({workflowMetrics.sunsetCount})
            </button>
            <ArrowRight size={12} color="#cbd5e1" />
            <button
              onClick={() => setStepFilter(2)}
              disabled={workflowMetrics.mergeCount === 0}
              style={{
                background: workflowMetrics.mergeCount > 0 ? "#fff" : "#f1f5f9",
                border:
                  workflowMetrics.mergeCount > 0
                    ? "1px solid #fdba74"
                    : "1px solid #e2e8f0",
                color: workflowMetrics.mergeCount > 0 ? "#c2410c" : "#94a3b8",
                padding: "6px 12px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 6,
                cursor: workflowMetrics.mergeCount > 0 ? "pointer" : "default",
                opacity: workflowMetrics.mergeCount > 0 ? 1 : 0.6,
              }}
            >
              <GitMerge size={12} /> 2. Consolidate (
              {workflowMetrics.mergeCount})
            </button>
            <ArrowRight size={12} color="#cbd5e1" />
            <button
              onClick={() => setStepFilter(3)}
              disabled={workflowMetrics.qualityCount === 0}
              style={{
                background:
                  workflowMetrics.qualityCount > 0 ? "#fff" : "#f1f5f9",
                border:
                  workflowMetrics.qualityCount > 0
                    ? "1px solid #7dd3fc"
                    : "1px solid #e2e8f0",
                color: workflowMetrics.qualityCount > 0 ? "#0369a1" : "#94a3b8",
                padding: "6px 12px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 6,
                cursor:
                  workflowMetrics.qualityCount > 0 ? "pointer" : "default",
                opacity: workflowMetrics.qualityCount > 0 ? 1 : 0.6,
              }}
            >
              <Wand2 size={12} /> 3. Review Quality (
              {workflowMetrics.qualityCount})
            </button>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 20,
            }}
          >
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <h3 style={{ margin: 0, fontWeight: 800 }}>
                Cluster Consolidation
              </h3>
              <div style={{ position: "relative" }}>
                <Search
                  size={14}
                  style={{
                    position: "absolute",
                    left: 10,
                    top: 10,
                    color: "#94a3b8",
                  }}
                />
                <input
                  type="text"
                  placeholder="Search clusters..."
                  value={clusterSearch}
                  onChange={(e) => setClusterSearch(e.target.value)}
                  style={{
                    padding: "8px 12px 8px 32px",
                    borderRadius: 6,
                    border: "1px solid #cbd5e1",
                    fontSize: 12,
                    width: 200,
                  }}
                />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {isProcessing && (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    fontSize: 12,
                    color: "#64748b",
                  }}
                >
                  <RefreshCw size={14} className="animate-spin" /> {progressMsg}
                </div>
              )}
              <input
                type="file"
                onChange={handleAuditUpload}
                style={{ fontSize: 12 }}
              />
            </div>
          </div>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}
          >
            <thead
              style={{
                background: "#f8fafc",
                position: "sticky",
                top: 175,
                zIndex: 90,
              }}
            >
              <tr>
                <th style={cellP}>CLUSTER</th>
                <th style={cellP}>TOTAL</th>
                <th style={cellP}>SHARED</th>
                <th style={cellP}>DUP %</th>
                <th style={cellP}>AVG CENTROID SCORE</th>
                <th style={cellP}>
                  HEALTH
                  <select
                    value={healthFilter}
                    onChange={(e) => setHealthFilter(e.target.value)}
                    style={{ marginLeft: 8, fontSize: 10 }}
                  >
                    <option value="All">All</option>
                    <option value="Healthy">Healthy</option>
                    <option value="Review">Review</option>
                  </select>
                </th>
                <th style={cellP}>
                  ISSUE
                  <select
                    value={issueFilter}
                    onChange={(e) => setIssueFilter(e.target.value)}
                    style={{ marginLeft: 8, fontSize: 10 }}
                  >
                    <option value="All">All</option>
                    <option value="Semantic Overlap">Semantic Overlap</option>
                    <option value="Content Overlap">Content Overlap</option>
                    <option value="Low Quality">Low Quality</option>
                    <option value="Fragmentation">Fragmentation</option>
                    <option value="Low Volume">Low Volume</option>
                  </select>
                </th>
                <th style={cellP}>
                  RECOMMENDATION
                  <select
                    value={recFilter}
                    onChange={(e) => setRecFilter(e.target.value)}
                    style={{ marginLeft: 8, fontSize: 10 }}
                  >
                    <option value="All">All</option>
                    <option value="Merge">Merge</option>
                    <option value="Sunset">Sunset</option>
                    <option value="Review Quality">Review Quality</option>
                  </select>
                </th>
                <th style={cellP}>TOOLS</th>
                <th style={cellP}>
                  ACTIONS
                  <button
                    onClick={handleAcceptAll}
                    style={{
                      marginLeft: 12,
                      fontSize: 9,
                      padding: "2px 8px",
                      background: "#3b82f6",
                      color: "white",
                      border: "none",
                      borderRadius: 4,
                    }}
                  >
                    Accept All
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((m: any) => {
                const mergedTarget = mergedClusters[m.cluster_name];
                const isAccepted = acceptedOverlaps[m.cluster_name];
                const isHealthy = m.health === "Healthy" || isAccepted;

                // Visual Indicators for Tools Used
                const tools = m.toolsUsed || {};
                let toolIcons = null;
                if (tools.magnet && tools.drift)
                  toolIcons = (
                    <span
                      title="Optimized with Magnet & Drift"
                      style={{ marginLeft: 4, fontSize: 10 }}
                    >
                      🧲💨
                    </span>
                  );
                else if (tools.magnet)
                  toolIcons = (
                    <span
                      title="Optimized with Magnet"
                      style={{ marginLeft: 4, fontSize: 10 }}
                    >
                      🧲
                    </span>
                  );
                else if (tools.drift)
                  toolIcons = (
                    <span
                      title="Optimized with Drift"
                      style={{ marginLeft: 4, fontSize: 10 }}
                    >
                      💨
                    </span>
                  );

                const scoreDisplay =
                  m.avg_score === "N/A" ? (
                    <span style={{ color: "#94a3b8" }}>N/A</span>
                  ) : (
                    <span>
                      {m.original_score && m.original_score !== m.avg_score && (
                        <span
                          style={{
                            textDecoration: "line-through",
                            color: "#94a3b8",
                            marginRight: 6,
                            fontSize: 10,
                          }}
                        >
                          {typeof m.original_score === "number"
                            ? m.original_score.toFixed(2)
                            : m.original_score}
                        </span>
                      )}
                      <span
                        style={{
                          color: m.optimizationSuccess ? "#16a34a" : "inherit",
                          fontWeight: m.optimizationSuccess ? 700 : 400,
                        }}
                      >
                        {m.avg_score}
                      </span>
                    </span>
                  );

                const isMergeSuggested = m.recommendation?.includes("Merge");

                return (
                  <tr
                    key={m.cluster_name}
                    style={{
                      borderBottom: "1px solid #f1f5f9",
                      opacity: mergedTarget ? 0.5 : 1,
                    }}
                  >
                    <td style={cellP}>
                      <b>{m.cluster_name}</b>
                    </td>
                    <td style={cellP}>{m.total}</td>
                    <td style={cellP}>
                      <span
                        style={{ color: m.shared > 0 ? "#ea4335" : "inherit" }}
                      >
                        {m.shared}
                      </span>
                    </td>
                    <td style={{ ...cellP, fontWeight: 800 }}>
                      {m.dup_percent}
                    </td>
                    <td style={cellP}>{scoreDisplay}</td>
                    <td style={cellP}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <span
                          style={{
                            background: isHealthy ? "#34a853" : "#ea4335",
                            color: "#fff",
                            padding: "3px 8px",
                            borderRadius: 4,
                            fontWeight: 900,
                            fontSize: 9,
                          }}
                        >
                          {mergedTarget
                            ? "Resolved"
                            : isAccepted
                            ? "Healthy"
                            : m.health}
                        </span>
                        {toolIcons}
                      </div>
                    </td>
                    <td style={cellP}>
                      <div
                        style={{ display: "flex", gap: 4, flexWrap: "wrap" }}
                      >
                        {m.issues?.map((iss: string) => renderIssueChip(iss))}
                      </div>
                    </td>
                    <td style={cellP}>
                      {mergedTarget
                        ? `Resolved via ${mergedTarget}`
                        : isAccepted
                        ? "✅ Verified / Ignored"
                        : m.recommendation}
                    </td>
                    <td style={cellP}>
                      {!mergedTarget && (
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => runMagnetScan(m.cluster_name)}
                            title="Magnet: Pull content in"
                            style={{
                              background: optimizedClusters.has(m.cluster_name)
                                ? "#e0f2fe"
                                : "#f0f9ff",
                              border: "1px solid #bae6fd",
                              color: "#0284c7",
                              borderRadius: 4,
                              padding: "4px 8px",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              fontSize: 10,
                            }}
                          >
                            <Magnet size={12} />
                          </button>
                          <button
                            onClick={() => runDriftScan(m.cluster_name)}
                            title="Remove Drift: Clean content out"
                            style={{
                              background: optimizedClusters.has(m.cluster_name)
                                ? "#ffedd5"
                                : "#fff7ed",
                              border: "1px solid #fed7aa",
                              color: "#ea580c",
                              borderRadius: 4,
                              padding: "4px 8px",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              fontSize: 10,
                            }}
                          >
                            <Wind size={12} />
                          </button>
                        </div>
                      )}
                    </td>

                    {/* --- UPDATED ACTIONS COLUMN --- */}
                    <td style={cellP}>
                      {!mergedTarget && (
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                            position: "relative",
                            justifyContent: "flex-end",
                          }}
                        >
                          {/* CHECKBOX */}
                          <label
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              fontSize: 10,
                              cursor: "pointer",
                              color: "#64748b",
                            }}
                            title="Ignore Overlap"
                          >
                            <input
                              type="checkbox"
                              checked={!!isAccepted}
                              onChange={() =>
                                toggleOverlapAcceptance(m.cluster_name)
                              }
                            />
                            Ignore
                          </label>

                          {/* MERGE BUTTON WITH INFO */}
                          {isMergeSuggested && (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              {/* SHOW TARGET CLUSTER INFO */}
                              {m.candidates && m.candidates[0] && (
                                <div
                                  style={{
                                    textAlign: "right",
                                    lineHeight: "1.1",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 700,
                                      color: "#475569",
                                    }}
                                  >
                                    →{" "}
                                    {m.candidates[0].name.length > 15
                                      ? m.candidates[0].name.substring(0, 12) +
                                        "..."
                                      : m.candidates[0].name}
                                  </div>
                                  <div
                                    style={{ fontSize: 9, color: "#3b82f6" }}
                                  >
                                    {(m.candidates[0].similarity * 100).toFixed(
                                      0
                                    )}
                                    % Similarity
                                  </div>
                                </div>
                              )}

                              <button
                                onClick={() => openMergeModal(m)}
                                style={{
                                  background: "#ea580c",
                                  color: "white",
                                  border: "none",
                                  borderRadius: 4,
                                  padding: "4px 8px",
                                  cursor: "pointer",
                                  fontSize: 10,
                                  fontWeight: 600,
                                }}
                              >
                                Merge
                              </button>
                            </div>
                          )}

                          {/* KEBAB MENU */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenu(
                                activeMenu === m.cluster_name
                                  ? null
                                  : m.cluster_name
                              );
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              color: "#64748b",
                              padding: 4,
                            }}
                          >
                            <MoreHorizontal size={16} />
                          </button>

                          {/* DROPDOWN */}
                          {activeMenu === m.cluster_name && (
                            <div
                              style={{
                                position: "absolute",
                                right: 0,
                                top: "100%",
                                background: "white",
                                border: "1px solid #e2e8f0",
                                borderRadius: 6,
                                padding: 4,
                                zIndex: 100,
                                boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                                minWidth: 140,
                              }}
                            >
                              {!isMergeSuggested && (
                                <div
                                  onClick={() => openMergeModal(m)}
                                  style={{
                                    padding: "8px 12px",
                                    fontSize: 12,
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    color: "#475569",
                                    borderBottom: "1px solid #f1f5f9",
                                  }}
                                >
                                  <GitMerge size={14} /> Manual Merge...
                                </div>
                              )}
                              <div
                                onClick={() =>
                                  executeAction(m, "__DEPRECATED__")
                                }
                                style={{
                                  padding: "8px 12px",
                                  fontSize: 12,
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  color: "#ef4444",
                                }}
                              >
                                <Trash2 size={14} /> Sunset Cluster
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* --- DUPLICATION ANALYSIS --- */}
      {activeTab === "duplication" && (
        <div
          style={{
            background: "#fff",
            padding: 24,
            borderRadius: 12,
            border: "1px solid #e2e8f0",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <h3 style={{ margin: 0, fontWeight: 800 }}>Refine URL Tags</h3>

            {/* NEW: Sweep Threshold Control */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label
                  style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}
                >
                  Weak Match Threshold:{" "}
                  <span style={{ color: "#3b82f6" }}>
                    {(sweepThreshold * 100).toFixed(0)}%
                  </span>
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="0.95"
                  step="0.05"
                  value={sweepThreshold}
                  onChange={(e) =>
                    setSweepThreshold(parseFloat(e.target.value))
                  }
                  style={{ width: 100, cursor: "pointer" }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <FilterIcon size={14} color="#64748b" />
                <select
                  value={dupStatusFilter}
                  onChange={(e) => setDupStatusFilter(e.target.value)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid #cbd5e1",
                    fontSize: 12,
                  }}
                >
                  <option value="All">All Duplicates</option>
                  <option value="Weak Matches (< 80%)">
                    Weak Matches (Below Threshold)
                  </option>
                  <option value="2 Clusters">2 Clusters</option>
                  <option value="3-4 Clusters">3-4 Clusters</option>
                  <option value="5+ Clusters">5+ Clusters</option>
                </select>
              </div>
            </div>
          </div>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}
          >
            <thead
              style={{
                background: "#f8fafc",
                position: "sticky",
                top: 175,
                zIndex: 90,
              }}
            >
              <tr>
                <th style={cellP}>URL</th>
                <th style={cellP}>COUNT</th>
                <th style={cellP}>ASSIGNED CLUSTERS (Ranked by Math Fit)</th>
              </tr>
            </thead>
            <tbody>
              {filteredUrlData.map((v: any) => {
                const activeCount = v.assignments.filter(
                  (a: any) => !mergedClusters[a.cluster]
                ).length;
                return (
                  <tr key={v.url} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        ...cellP,
                        maxWidth: 300,
                        wordBreak: "break-all",
                      }}
                    >
                      {v.url}
                    </td>
                    <td style={cellP}>
                      <span style={{ fontWeight: 700 }}>{activeCount}</span>
                      <span
                        style={{
                          color: "#94a3b8",
                          marginLeft: 4,
                          fontSize: 10,
                        }}
                      >
                        active
                      </span>
                    </td>
                    <td style={cellP}>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        {v.assignments.map((a: any, idx: number) => {
                          const isDeprecated = mergedClusters[a.cluster];
                          const isBest = idx === 0 && !isDeprecated;

                          // NEW: Highlight weak matches
                          const isWeak =
                            a.score < sweepThreshold && !isDeprecated;

                          return (
                            <div
                              key={a.cluster}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "4px 8px",
                                borderRadius: 6,
                                border: isBest
                                  ? "1px solid #86efac"
                                  : isWeak
                                  ? "1px solid #fca5a5" // Red border for weak
                                  : "1px solid #e2e8f0",
                                background: isDeprecated
                                  ? "#f3f4f6"
                                  : isBest
                                  ? "#f0fdf4"
                                  : isWeak
                                  ? "#fef2f2" // Red bg for weak
                                  : "white",
                                opacity: isDeprecated ? 0.4 : 1,
                                fontSize: 11,
                              }}
                            >
                              <span
                                style={{
                                  fontWeight: isBest ? 700 : 400,
                                  textDecoration: isDeprecated
                                    ? "line-through"
                                    : "none",
                                  color: isWeak ? "#b91c1c" : "inherit",
                                }}
                              >
                                {a.cluster}
                              </span>
                              <span style={{ fontSize: 10, opacity: 0.7 }}>
                                {(a.score * 100).toFixed(0)}%
                              </span>
                              {!isDeprecated && (
                                <button
                                  onClick={() =>
                                    removeUrlAssignment(v.url, a.cluster)
                                  }
                                  style={{
                                    border: "none",
                                    background: "none",
                                    cursor: "pointer",
                                    color: "#94a3b8",
                                  }}
                                >
                                  <XIcon size={12} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                        <button
                          onClick={() => openAssignModal(v)}
                          style={{
                            padding: "4px",
                            borderRadius: "50%",
                            border: "1px dashed #cbd5e1",
                            background: "none",
                            cursor: "pointer",
                            color: "#94a3b8",
                          }}
                          title="Assign to New Cluster"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* --- MASTER URL INDEX --- */}
      {activeTab === "master" && (
        <div
          style={{
            background: "#fff",
            padding: 24,
            borderRadius: 12,
            border: "1px solid #e2e8f0",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 20,
            }}
          >
            <div>
              <h3 style={{ margin: "0 0 4px 0", fontWeight: 800 }}>
                Master URL Index
              </h3>
              <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
                Searchable database of {urlAnalysisData.length} URLs.
              </p>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ position: "relative" }}>
                <Search
                  size={14}
                  style={{
                    position: "absolute",
                    left: 10,
                    top: 10,
                    color: "#94a3b8",
                  }}
                />
                <input
                  type="text"
                  placeholder="Search URL..."
                  value={masterSearch}
                  onChange={(e) => setMasterSearch(e.target.value)}
                  style={{
                    padding: "8px 12px 8px 32px",
                    borderRadius: 6,
                    border: "1px solid #cbd5e1",
                    fontSize: 12,
                    width: 200,
                  }}
                />
              </div>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  list="clusterOptions"
                  placeholder="Filter by Cluster..."
                  value={
                    masterClusterFilter === "All" ? "" : masterClusterFilter
                  }
                  onChange={(e) =>
                    setMasterClusterFilter(e.target.value || "All")
                  }
                  style={{
                    padding: "8px 12px 8px 12px",
                    borderRadius: 6,
                    border: "1px solid #cbd5e1",
                    fontSize: 12,
                    width: 200,
                  }}
                />
                <datalist id="clusterOptions">
                  {analysisData
                    .filter(
                      (c) => mergedClusters[c.cluster_name] !== "__DEPRECATED__"
                    )
                    .map((c) => (
                      <option key={c.cluster_name} value={c.cluster_name} />
                    ))}
                </datalist>
              </div>
            </div>
          </div>
          <div
            style={{
              overflowX: "auto",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 11,
              }}
            >
              <thead
                style={{
                  background: "#f8fafc",
                  textAlign: "left",
                  position: "sticky",
                  top: 100, // Reduced sticky offset for Master Index
                  zIndex: 90,
                }}
              >
                <tr>
                  <th style={cellP}>URL</th>
                  <th style={cellP}>STATUS</th>
                  <th style={cellP}>PRIMARY CLUSTER</th>
                  <th style={cellP}>SCORE</th>
                  <th style={cellP}>ALL TAGS</th>
                  <th style={cellP}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {masterIndexData.slice(0, 100).map((v: any) => {
                  const primary = v.assignments.find(
                    (a: any) => !mergedClusters[a.cluster]
                  );

                  let statusBadge = {
                    bg: "#dcfce7",
                    col: "#166534",
                    text: "Unique",
                  };
                  const activeCount = v.assignments.filter(
                    (a: any) => !mergedClusters[a.cluster]
                  ).length;

                  if (prunedUrls.has(v.url))
                    statusBadge = {
                      bg: "#fee2e2",
                      col: "#b91c1c",
                      text: "🔴 Pruned",
                    };
                  else if (activeCount === 0)
                    statusBadge = {
                      bg: "#f1f5f9",
                      col: "#64748b",
                      text: "Orphan",
                    };
                  else if (activeCount === 1)
                    statusBadge = {
                      bg: "#dcfce7",
                      col: "#166534",
                      text: "Unique",
                    };
                  else if (activeCount === 2)
                    statusBadge = {
                      bg: "#e0e7ff",
                      col: "#4338ca",
                      text: "Cross-Listed",
                    };
                  else if (activeCount > 2)
                    statusBadge = {
                      bg: "#fee2e2",
                      col: "#b91c1c",
                      text: "Fragmented",
                    };

                  let scoreColor = "#34a853";
                  if (primary) {
                    const sVal = primary.score * 100;
                    if (sVal < 75) scoreColor = "#ea4335";
                    else if (sVal < 80) scoreColor = "#ca8a04";
                  }

                  return (
                    <tr
                      key={v.url}
                      style={{
                        borderBottom: "1px solid #f1f5f9",
                        opacity: prunedUrls.has(v.url) ? 0.5 : 1,
                      }}
                    >
                      <td
                        style={{
                          ...cellP,
                          maxWidth: 350,
                          wordBreak: "break-all",
                        }}
                      >
                        {v.url}
                      </td>
                      <td style={cellP}>
                        <span
                          style={{
                            background: statusBadge.bg,
                            color: statusBadge.col,
                            padding: "2px 6px",
                            borderRadius: 4,
                            fontWeight: 700,
                            fontSize: 10,
                          }}
                        >
                          {statusBadge.text}
                        </span>
                      </td>
                      <td style={cellP}>
                        {primary ? (
                          <span style={{ fontWeight: 600 }}>
                            {primary.cluster}
                          </span>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>-</span>
                        )}
                      </td>
                      <td style={cellP}>
                        {primary ? (
                          <span style={{ color: scoreColor, fontWeight: 700 }}>
                            {(primary.score * 100).toFixed(0)}%
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td style={cellP}>
                        <div
                          style={{
                            display: "flex",
                            gap: 4,
                            flexWrap: "wrap",
                          }}
                        >
                          {v.assignments.map((a: any) => (
                            <span
                              key={a.cluster}
                              style={{
                                fontSize: 9,
                                padding: "2px 6px",
                                borderRadius: 10,
                                border: "1px solid #e2e8f0",
                                background: "white",
                                color: "#475569",
                                textDecoration: mergedClusters[a.cluster]
                                  ? "line-through"
                                  : "none",
                                opacity: mergedClusters[a.cluster] ? 0.5 : 1,
                              }}
                            >
                              {a.cluster}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={cellP}>
                        {prunedUrls.has(v.url) ? (
                          <button
                            onClick={() => undoPrune(v.url)}
                            style={{
                              color: "#16a34a",
                              border: "none",
                              background: "none",
                              cursor: "pointer",
                              fontSize: 10,
                              fontWeight: 700,
                            }}
                          >
                            Undo Prune
                          </button>
                        ) : (
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              onClick={() => openAssignModal(v)}
                              style={{
                                color: "#2563eb",
                                border: "none",
                                background: "none",
                                cursor: "pointer",
                              }}
                            >
                              <Plus size={14} />
                            </button>
                            <button
                              onClick={() => pruneUrl(v.url)}
                              style={{
                                color: "#ef4444",
                                border: "none",
                                background: "none",
                                cursor: "pointer",
                              }}
                              title="Prune URL"
                            >
                              <Scissors size={14} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- REVIEW TAB --- */}
      {activeTab === "review" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr",
              gap: 16,
            }}
          >
            <StatCard
              title="CLUSTERS MERGED"
              val={String(
                Object.values(mergedClusters).filter(
                  (v) => v !== "__DEPRECATED__"
                ).length
              )}
              color="#8b5cf6"
              icon={<GitMerge size={24} />}
            />
            <StatCard
              title="CLUSTERS SUNSET"
              val={String(
                Object.values(mergedClusters).filter(
                  (v) => v === "__DEPRECATED__"
                ).length
              )}
              color="#ea4335"
              icon={<Trash2 size={24} />}
            />
            <StatCard
              title="URLS RE-HOMED"
              val={String(rehomedCount)}
              color="#3b82f6"
              icon={<RefreshCw size={24} />}
            />
            <StatCard
              title="ORPHANS CREATED"
              val={String(orphans.length)}
              color={orphans.length > 0 ? "#ea4335" : "#34a853"}
              icon={<AlertCircle size={24} />}
            />
          </div>

          {orphans.length > 0 && (
            <div
              style={{
                background: "#fff",
                padding: 24,
                borderRadius: 12,
                border: "1px solid #fee2e2",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <h3 style={{ margin: 0, color: "#b91c1c" }}>
                    🚨 Action Required: {orphans.length} Orphaned URLs
                  </h3>

                  {/* NEW: Orphan Threshold Filter & Toggle */}
                  <div
                    style={{ display: "flex", gap: 12, alignItems: "center" }}
                  >
                    {/* TOGGLE MODE */}
                    <div
                      style={{
                        background: "#f1f5f9",
                        borderRadius: 20,
                        padding: 2,
                        display: "flex",
                      }}
                    >
                      <button
                        onClick={() => setOrphanFilterMode("matches")}
                        style={{
                          border: "none",
                          background:
                            orphanFilterMode === "matches" ? "white" : "none",
                          borderRadius: 18,
                          padding: "4px 12px",
                          fontSize: 11,
                          fontWeight: 600,
                          color:
                            orphanFilterMode === "matches"
                              ? "#166534"
                              : "#64748b",
                          cursor: "pointer",
                          boxShadow:
                            orphanFilterMode === "matches"
                              ? "0 1px 2px rgba(0,0,0,0.1)"
                              : "none",
                        }}
                      >
                        Matches
                      </button>
                      <button
                        onClick={() => setOrphanFilterMode("unmatched")}
                        style={{
                          border: "none",
                          background:
                            orphanFilterMode === "unmatched" ? "white" : "none",
                          borderRadius: 18,
                          padding: "4px 12px",
                          fontSize: 11,
                          fontWeight: 600,
                          color:
                            orphanFilterMode === "unmatched"
                              ? "#b91c1c"
                              : "#64748b",
                          cursor: "pointer",
                          boxShadow:
                            orphanFilterMode === "unmatched"
                              ? "0 1px 2px rgba(0,0,0,0.1)"
                              : "none",
                        }}
                      >
                        No Matches
                      </button>
                    </div>

                    {/* SLIDER (Only show in Matches mode) */}
                    {orphanFilterMode === "matches" && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          background: "#fef2f2",
                          padding: "4px 8px",
                          borderRadius: 6,
                          border: "1px solid #fecaca",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            color: "#b91c1c",
                            fontWeight: 600,
                          }}
                        >
                          Min Match: {(orphanMatchThreshold * 100).toFixed(0)}%
                        </span>
                        <input
                          type="range"
                          min="0.5"
                          max="0.95"
                          step="0.05"
                          value={orphanMatchThreshold}
                          onChange={(e) =>
                            setOrphanMatchThreshold(parseFloat(e.target.value))
                          }
                          style={{ width: 80, accentColor: "#b91c1c" }}
                        />
                      </div>
                    )}

                    {/* BULK ACTIONS */}
                    {orphanFilterMode === "matches" &&
                      filteredOrphans.length > 0 && (
                        <button
                          onClick={batchAcceptOrphans}
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            background: "#16a34a",
                            color: "white",
                            border: "none",
                            borderRadius: 6,
                            padding: "6px 12px",
                            cursor: "pointer",
                          }}
                        >
                          Accept All ({filteredOrphans.length})
                        </button>
                      )}

                    {orphanFilterMode === "unmatched" &&
                      filteredOrphans.length > 0 && (
                        <button
                          onClick={batchPruneOrphans}
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            background: "#b91c1c",
                            color: "white",
                            border: "none",
                            borderRadius: 6,
                            padding: "6px 12px",
                            cursor: "pointer",
                          }}
                        >
                          Prune All ({filteredOrphans.length})
                        </button>
                      )}
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: "#7f1d1d" }}>
                  These URLs have lost all cluster tags. Assign them new homes.
                </p>
              </div>
              <div style={{ maxHeight: 250, overflowY: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    fontSize: 11,
                    borderCollapse: "collapse",
                  }}
                >
                  <thead style={{ background: "#fef2f2", textAlign: "left" }}>
                    <tr>
                      <th style={cellP}>URL</th>
                      <th style={cellP}>BEST MATCH</th>
                      <th style={cellP}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrphans.slice(0, 50).map((u) => {
                      const bestMatch = getBestMatchForOrphan(u);
                      return (
                        <tr
                          key={u.url}
                          style={{ borderBottom: "1px solid #fee2e2" }}
                        >
                          <td
                            style={{
                              ...cellP,
                              maxWidth: 400,
                              wordBreak: "break-all",
                            }}
                          >
                            {u.url}
                          </td>
                          <td style={cellP}>
                            {bestMatch ? (
                              <span
                                style={{ color: "#16a34a", fontWeight: 600 }}
                              >
                                {bestMatch.name} (
                                {(bestMatch.score * 100).toFixed(0)}%)
                              </span>
                            ) : (
                              <span style={{ color: "#94a3b8" }}>-</span>
                            )}
                          </td>
                          <td style={cellP}>
                            {bestMatch ? (
                              <div style={{ display: "flex", gap: 8 }}>
                                <button
                                  onClick={() =>
                                    addNewAssignment(
                                      u.url,
                                      bestMatch.name,
                                      bestMatch.score
                                    )
                                  }
                                  style={{
                                    background: "#dcfce7",
                                    border: "1px solid #86efac",
                                    padding: "4px 12px",
                                    borderRadius: 6,
                                    cursor: "pointer",
                                    color: "#166534",
                                    fontWeight: 600,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                  }}
                                >
                                  <CornerUpRight size={12} /> Assign to{" "}
                                  {bestMatch.name}
                                </button>
                                <button
                                  onClick={() => openAssignModal(u)}
                                  style={{
                                    background: "white",
                                    border: "1px solid #cbd5e1",
                                    padding: "4px 8px",
                                    borderRadius: 6,
                                    cursor: "pointer",
                                    color: "#64748b",
                                  }}
                                  title="Manual Assign"
                                >
                                  <ListFilter size={14} />
                                </button>
                                <button
                                  onClick={() => pruneUrl(u.url)}
                                  style={{
                                    background: "white",
                                    border: "1px solid #fecaca",
                                    padding: "4px 8px",
                                    borderRadius: 6,
                                    cursor: "pointer",
                                    color: "#b91c1c",
                                  }}
                                  title="Prune"
                                >
                                  <Scissors size={14} />
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: "flex", gap: 8 }}>
                                <button
                                  onClick={() => openAssignModal(u)}
                                  style={{
                                    background: "white",
                                    border: "1px solid #cbd5e1",
                                    padding: "4px 12px",
                                    borderRadius: 6,
                                    cursor: "pointer",
                                    color: "#64748b",
                                    fontWeight: 600,
                                  }}
                                >
                                  + Manual Assign
                                </button>
                                <button
                                  onClick={() => pruneUrl(u.url)}
                                  style={{
                                    background: "white",
                                    border: "1px solid #fecaca",
                                    padding: "4px 8px",
                                    borderRadius: 6,
                                    cursor: "pointer",
                                    color: "#b91c1c",
                                  }}
                                  title="Prune"
                                >
                                  <Scissors size={14} />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div
            style={{
              background: "#fff",
              padding: 24,
              borderRadius: 12,
              border: "1px solid #e2e8f0",
            }}
          >
            <h3 style={{ margin: "0 0 20px 0", fontWeight: 800 }}>
              Full Change Log
            </h3>
            {["Sunset", "Merge", "Keep", "Pruned", "Rehomed"].map((type) => {
              const items = reviewData[type] || [];
              const isOpen = expandedSections[type];
              if (items.length === 0) return null;

              return (
                <div
                  key={type}
                  style={{
                    marginBottom: 12,
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    overflow: "hidden",
                  }}
                >
                  <div
                    onClick={() => toggleSection(type)}
                    style={{
                      padding: "12px 16px",
                      background: "#f8fafc",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontWeight: 600,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      {type === "Sunset" ? (
                        <Trash2 size={16} color="#ef4444" />
                      ) : type === "Merge" ? (
                        <GitMerge size={16} color="#8b5cf6" />
                      ) : type === "Pruned" ? (
                        <Scissors size={16} color="#b91c1c" />
                      ) : type === "Rehomed" ? (
                        <CornerUpRight size={16} color="#059669" />
                      ) : (
                        <CheckCircle2 size={16} color="#34a853" />
                      )}
                      {type} Actions ({items.length})
                    </div>
                    {isOpen ? (
                      <ChevronDown size={16} />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                  </div>
                  {isOpen && (
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: 11,
                      }}
                    >
                      <thead
                        style={{
                          background: "#fff",
                          textAlign: "left",
                          borderBottom: "1px solid #f1f5f9",
                        }}
                      >
                        <tr>
                          <th style={cellP}>SOURCE</th>
                          <th style={cellP}>ACTION</th>
                          <th style={cellP}>TARGET</th>
                          <th style={cellP}>INSTRUCTIONS</th>
                          <th style={cellP}>COMMENTS</th>
                          <th style={cellP}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((row, i) => (
                          <tr
                            key={i}
                            style={{ borderBottom: "1px solid #f1f5f9" }}
                          >
                            <td style={cellP}>
                              <div
                                style={{
                                  fontWeight: 700,
                                  maxWidth: 300,
                                  wordBreak: "break-all",
                                }}
                              >
                                {row.source}
                              </div>
                              {type === "Sunset" && (
                                <div
                                  style={{
                                    fontSize: 9,
                                    color: "#94a3b8",
                                    marginTop: 2,
                                  }}
                                >
                                  Low Volume ({row.urlCount} URLs)
                                </div>
                              )}
                            </td>
                            <td style={cellP}>
                              <span
                                style={{
                                  background:
                                    row.type === "Merge"
                                      ? "#e0e7ff"
                                      : row.type === "Sunset"
                                      ? "#fee2e2"
                                      : row.type === "Re-home"
                                      ? "#dcfce7"
                                      : "#f3f4f6",
                                  color:
                                    row.type === "Merge"
                                      ? "#4338ca"
                                      : row.type === "Sunset"
                                      ? "#b91c1c"
                                      : row.type === "Re-home"
                                      ? "#166534"
                                      : "#4b5563",
                                  padding: "3px 8px",
                                  borderRadius: 4,
                                  fontWeight: 700,
                                  fontSize: 10,
                                }}
                              >
                                {row.type.toUpperCase()}
                              </span>
                            </td>
                            <td style={cellP}>{row.target}</td>
                            <td style={cellP}>
                              <div
                                style={{
                                  color: "#64748b",
                                  fontStyle: "italic",
                                }}
                              >
                                {row.type === "Merge"
                                  ? `Redirect ${row.source} → ${row.target}`
                                  : row.type === "Prune"
                                  ? "Permanently Remove URL"
                                  : row.type === "Sunset"
                                  ? `Delete tag ${row.source}`
                                  : row.type === "Re-home"
                                  ? "Add tag to URL"
                                  : "Healthy"}
                              </div>
                              {row.type === "Sunset" && (
                                <div
                                  style={{
                                    fontSize: 9,
                                    color: "#ea580c",
                                    marginTop: 4,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                  }}
                                >
                                  <AlertCircle size={10} /> URLs moved to Orphan
                                  List for Retagging
                                </div>
                              )}
                            </td>
                            <td style={cellP}>
                              <div style={{ position: "relative" }}>
                                <MessageSquare
                                  size={12}
                                  style={{
                                    position: "absolute",
                                    top: 9,
                                    left: 8,
                                    color: "#94a3b8",
                                  }}
                                />
                                <input
                                  type="text"
                                  placeholder="Add notes..."
                                  value={changeComments[row.source] || ""}
                                  onChange={(e) =>
                                    updateComment(row.source, e.target.value)
                                  }
                                  style={{
                                    border: "1px solid #e2e8f0",
                                    borderRadius: 4,
                                    padding: "6px 8px 6px 26px",
                                    fontSize: 11,
                                    width: "100%",
                                    maxWidth: 200,
                                  }}
                                />
                              </div>
                            </td>
                            <td style={cellP}>
                              {row.type === "Prune" ? (
                                <button
                                  onClick={() => undoPrune(row.source)}
                                  style={{
                                    color: "#ea4335",
                                    border: "none",
                                    background: "none",
                                    cursor: "pointer",
                                  }}
                                >
                                  Undo
                                </button>
                              ) : row.type === "Re-home" ? (
                                <button
                                  onClick={() => undoRehome(row.source)}
                                  style={{
                                    color: "#ea4335",
                                    border: "none",
                                    background: "none",
                                    cursor: "pointer",
                                  }}
                                >
                                  Undo
                                </button>
                              ) : (
                                <button
                                  onClick={() => undoAction(row.source)}
                                  style={{
                                    color: "#ea4335",
                                    border: "none",
                                    background: "none",
                                    cursor: "pointer",
                                  }}
                                >
                                  Undo
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* --- MODALS (MERGE, ASSIGN, MAGNET) --- */}
      {assignModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 999,
          }}
        >
          <div
            style={{
              background: "white",
              padding: 24,
              borderRadius: 12,
              width: 450,
              boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
              maxHeight: "80vh",
              overflowY: "auto",
            }}
          >
            <h3 style={{ marginTop: 0 }}>Assign New Cluster</h3>

            {/* NEW: SEARCH BAR */}
            <div style={{ marginBottom: 16, position: "relative" }}>
              <Search
                size={14}
                style={{
                  position: "absolute",
                  left: 10,
                  top: 10,
                  color: "#94a3b8",
                }}
              />
              <input
                type="text"
                placeholder="Search any cluster..."
                value={manualAssignSearch}
                onChange={(e) => setManualAssignSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px 8px 32px",
                  border: "1px solid #cbd5e1",
                  borderRadius: 6,
                  fontSize: 13,
                }}
                autoFocus
              />
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginBottom: 20,
              }}
            >
              {manualAssignSearch ? (
                // FILTERED RESULTS
                analysisData
                  .filter(
                    (c) =>
                      !mergedClusters[c.cluster_name] &&
                      c.cluster_name
                        .toLowerCase()
                        .includes(manualAssignSearch.toLowerCase())
                  )
                  .slice(0, 10) // Limit to top 10 matches
                  .map((c, i) => (
                    <div
                      key={i}
                      onClick={
                        () =>
                          addNewAssignment(
                            activeAssignUrl.url,
                            c.cluster_name,
                            1.0
                          ) // 1.0 for manual
                      }
                      style={{
                        padding: 10,
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{c.cluster_name}</span>
                      <span style={{ fontSize: 11, color: "#64748b" }}>
                        Manual Select
                      </span>
                    </div>
                  ))
              ) : (
                // DEFAULT SUGGESTIONS
                <>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      marginBottom: 4,
                    }}
                  >
                    Recommended Matches
                  </div>
                  {assignSuggestions.map((s, i) => (
                    <div
                      key={i}
                      onClick={() =>
                        addNewAssignment(activeAssignUrl.url, s.name, s.score)
                      }
                      style={{
                        padding: 10,
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{s.name}</span>
                      <span style={{ fontSize: 11, color: "#34a853" }}>
                        {(s.score * 100).toFixed(1)}% Match
                      </span>
                    </div>
                  ))}
                  {assignSuggestions.length === 0 && (
                    <div
                      style={{
                        textAlign: "center",
                        color: "#94a3b8",
                        padding: 20,
                        fontSize: 13,
                      }}
                    >
                      No strong semantic matches found. Search above.
                    </div>
                  )}
                </>
              )}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => pruneUrl(activeAssignUrl.url)}
                style={{
                  flex: 1,
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid #fecaca",
                  background: "#fef2f2",
                  color: "#b91c1c",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Prune URL (Delete)
              </button>
              <button
                onClick={() => setAssignModalOpen(false)}
                style={{
                  flex: 1,
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  background: "none",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {mergeModalOpen && activeMergeCluster && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 999,
          }}
        >
          <div
            style={{
              background: "white",
              padding: 24,
              borderRadius: 12,
              width: 500,
              boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
            }}
          >
            <h3 style={{ marginTop: 0 }}>
              Merge '{activeMergeCluster.cluster_name}'
            </h3>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                maxHeight: 300,
                overflowY: "auto",
              }}
            >
              {activeMergeCluster.candidates
                .filter(
                  (cand: any) =>
                    !mergedClusters[cand.name] && cand.name !== "__DEPRECATED__"
                )
                .map((cand: any, i: number) => (
                  <div
                    key={i}
                    onClick={() => executeAction(activeMergeCluster, cand.name)}
                    style={{
                      padding: 12,
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                      cursor: "pointer",
                      background: i === 0 ? "#fff7ed" : "white",
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{cand.name}</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>
                      {cand.type} Match • {(cand.score * 100).toFixed(0)}%
                      Similarity • {cand.targetSize} URLs
                    </div>
                  </div>
                ))}
            </div>
            <button
              onClick={() => setMergeModalOpen(false)}
              style={{
                marginTop: 20,
                width: "100%",
                padding: 10,
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                background: "none",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {magnetModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 999,
          }}
        >
          <div
            style={{
              background: "white",
              padding: 24,
              borderRadius: 12,
              width: 700,
              maxHeight: "80vh",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <h3 style={{ marginTop: 0 }}>
                {isDriftMode ? "Remove Drift" : "Magnet Scan"}
              </h3>
              <button
                onClick={() => setMagnetModalOpen(false)}
                style={{
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                }}
              >
                <XIcon />
              </button>
            </div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 10 }}>
              {isDriftMode
                ? `Reviewing low-relevance items in ${magnetCluster}`
                : `Pulling items into ${magnetCluster}`}
            </div>

            {!isDriftMode && (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 16,
                  cursor: "pointer",
                }}
              >
                <div onClick={handleGlobalCopyToggle}>
                  {isCopyMode ? (
                    <CheckSquare size={16} color="#3b82f6" />
                  ) : (
                    <Square size={16} color="#cbd5e1" />
                  )}
                </div>
                Keep URL in original cluster? (Copy instead of Move)
              </label>
            )}

            {magnetCandidates.length > 0 ? (
              <div
                style={{
                  maxHeight: 400,
                  overflowY: "auto",
                  border: "1px solid #f1f5f9",
                  borderRadius: 8,
                }}
              >
                <table
                  style={{
                    width: "100%",
                    fontSize: 11,
                    borderCollapse: "collapse",
                  }}
                >
                  <thead
                    style={{
                      textAlign: "left",
                      background: "#f8fafc",
                      color: "#64748b",
                      position: "sticky",
                      top: 0,
                    }}
                  >
                    <tr>
                      {!isDriftMode && (
                        <th style={{ padding: 8, width: 30 }}></th>
                      )}

                      <th style={{ padding: 8 }}>URL</th>
                      <th style={{ padding: 8 }}>SOURCE</th>
                      <th style={{ padding: 8 }}>
                        {isDriftMode ? "SCORE" : "CURRENT → NEW"}
                      </th>
                      {!isDriftMode && (
                        <>
                          <th style={{ padding: 8 }}>GAIN</th>
                          <th style={{ padding: 8 }}>KEEP OLD?</th>
                        </>
                      )}
                      {isDriftMode && (
                        <>
                          <th style={{ padding: 8 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              ACTION: REMOVE
                              <span title="Checked = Remove from this cluster">
                                <Info size={12} />
                              </span>
                            </div>
                          </th>
                          <th style={{ padding: 8 }}>BETTER HOME?</th>
                          <th style={{ padding: 8 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              ACTION: MOVE
                              <span title="Checked = Move to new home">
                                <Info size={12} />
                              </span>
                            </div>
                          </th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {magnetCandidates.slice(0, 100).map((cand, i) => (
                      <tr
                        key={i}
                        style={{
                          borderBottom: "1px solid #f1f5f9",
                          background: selectedMagnetUrls.has(cand.url)
                            ? "#f0f9ff"
                            : "white",
                        }}
                      >
                        {!isDriftMode && (
                          <td style={{ padding: 8 }}>
                            <div
                              onClick={() => toggleMagnetSelection(cand.url)}
                              style={{ cursor: "pointer" }}
                            >
                              {selectedMagnetUrls.has(cand.url) ? (
                                <CheckSquare size={14} color="#3b82f6" />
                              ) : (
                                <Square size={14} color="#cbd5e1" />
                              )}
                            </div>
                          </td>
                        )}
                        <td
                          style={{
                            padding: 8,
                            maxWidth: 200,
                            wordBreak: "break-all",
                          }}
                        >
                          {cand.url}
                        </td>
                        <td style={{ padding: 8 }}>{cand.current_cluster}</td>
                        <td style={{ padding: 8 }}>
                          {isDriftMode ? (
                            <span style={{ color: "#ef4444", fontWeight: 700 }}>
                              {cand.score.toFixed(2)}
                            </span>
                          ) : (
                            <span>
                              {cand.current_score.toFixed(2)} →{" "}
                              {cand.new_score.toFixed(2)}
                            </span>
                          )}
                        </td>
                        {!isDriftMode && (
                          <td
                            style={{
                              padding: 8,
                              color: "#16a34a",
                              fontWeight: 700,
                            }}
                          >
                            +{(cand.improvement * 100).toFixed(0)}%
                          </td>
                        )}
                        {!isDriftMode && (
                          <td style={{ padding: 8 }}>
                            <div
                              onClick={() => toggleKeepSelection(cand.url)}
                              style={{
                                cursor: "pointer",
                                display: "flex",
                                justifyContent: "center",
                              }}
                            >
                              {keepOriginalUrls.has(cand.url) ? (
                                <CheckSquare size={14} color="#8b5cf6" />
                              ) : (
                                <Square size={14} color="#cbd5e1" />
                              )}
                            </div>
                          </td>
                        )}
                        {isDriftMode && (
                          <>
                            <td style={{ padding: 8 }}>
                              <div
                                onClick={() =>
                                  toggleDriftChoice(cand.url, "remove")
                                }
                                style={{ cursor: "pointer" }}
                              >
                                {driftChoices[cand.url]?.remove ? (
                                  <CheckSquare size={14} color="#ef4444" />
                                ) : (
                                  <Square size={14} color="#cbd5e1" />
                                )}
                              </div>
                            </td>
                            <td
                              style={{
                                padding: 8,
                                color: cand.suggested_cluster
                                  ? "#2563eb"
                                  : "#94a3b8",
                              }}
                            >
                              {cand.suggested_cluster
                                ? `${
                                    cand.suggested_cluster
                                  } (${cand.suggested_score.toFixed(2)})`
                                : "-"}
                            </td>
                            <td style={{ padding: 8 }}>
                              {cand.suggested_cluster && (
                                <div
                                  onClick={() =>
                                    toggleDriftChoice(cand.url, "add")
                                  }
                                  style={{ cursor: "pointer" }}
                                >
                                  {driftChoices[cand.url]?.add ? (
                                    <CheckSquare size={14} color="#3b82f6" />
                                  ) : (
                                    <Square size={14} color="#cbd5e1" />
                                  )}
                                </div>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div
                style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}
              >
                No items found.
              </div>
            )}

            <div
              style={{
                marginTop: 20,
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                onClick={() => setMagnetModalOpen(false)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => confirmMagnetMove()}
                disabled={
                  selectedMagnetUrls.size === 0 &&
                  !isDriftMode &&
                  Object.keys(driftChoices).length === 0
                }
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "none",
                  background: "#3b82f6",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                Confirm Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
