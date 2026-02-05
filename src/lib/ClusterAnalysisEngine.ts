/**
 * Nexus Cluster Analysis Engine
 * Location: src/lib/ClusterAnalysisEngine.ts
 */
import { calculateGlobalCentroid, cosineSimilarity } from "./expertiseMetrics";

export interface AnalysisConfig {
  maxDupRate: number;
  minAvgScore: number;
  mergeThreshold: number;
  vectorThreshold: number;
  minUrlCount: number;
  magnetMinScore: number;
  magnetMaxCurrentScore: number;
}

export interface ClusterObject {
  name: string;
  urls: any[];
  urlSet: Set<string>;
  centroid: number[];
  metrics: any;
  candidates: {
    name: string;
    count: number;
    percent: number;
    type: "Structural" | "Semantic";
    similarity: number;
    targetSize: number;
    score: number;
  }[];
  topMatch: any;
  role: "Parent" | "Child" | "Orphan";
  children: string[];
  recommendation?: string;
  target_cluster?: string | null;
  issueType: string;
}

class ClusterAnalysisEngine {
  rawData: any[];
  clusters: Map<string, ClusterObject>;
  urls: Map<string, any>;

  constructor(rawCsvData: any[]) {
    this.rawData = rawCsvData;
    this.clusters = new Map();
    this.urls = new Map();
  }

  async process(config: AnalysisConfig, onProgress?: (step: string) => void) {
    const report = async (msg: string) => {
      if (onProgress) onProgress(msg);
      await new Promise((resolve) => setTimeout(resolve, 0));
    };

    await report("Ingesting Data...");
    this.rawData.forEach((row) => {
      const clusterName = row.cluster_name;
      const url = row.url;
      const score = parseFloat(row.semantic_score || 0);
      const embedding = row.embedding || [];

      if (!url || !clusterName) return;

      if (!this.urls.has(url)) {
        this.urls.set(url, {
          url: url,
          assignments: [],
          primary_cluster: null,
          max_score: 0,
        });
      }
      this.urls.get(url).assignments.push({
        cluster: clusterName,
        score: score,
        embedding: embedding,
      });

      if (!this.clusters.has(clusterName)) {
        this.clusters.set(clusterName, {
          name: clusterName,
          urls: [],
          urlSet: new Set(),
          centroid: [],
          metrics: {},
          candidates: [],
          topMatch: null,
          role: "Orphan",
          children: [],
          issueType: "None",
        });
      }
      const cluster = this.clusters.get(clusterName);
      if (cluster) {
        cluster.urls.push({ url, score, embedding });
        cluster.urlSet.add(url);
      }
    });

    await report("Calculating Centroids...");
    this.calculateClusterCentroids();

    await report("Backfilling Scores...");
    this.backfillScores();

    await report("Analyzing Metrics...");
    this.calculateUrlMetrics();
    this.calculateBasicMetrics();

    await report("Finding Merge Candidates...");
    this.calculateHybridOverlaps(config);

    await report("Building Hierarchy...");
    this.determineHierarchy(config);

    await report("Finalizing Health...");
    this.determineFinalHealth(config);

    return this.getResults();
  }

  recalculateClusterStats(clusterName: string) {
    const cluster = this.clusters.get(clusterName);
    if (!cluster) return null;

    const validEntries = cluster.urls.filter(
      (u) => u.embedding && u.embedding.length > 0
    );
    if (validEntries.length > 0) {
      const rowsForCalc = validEntries.map((u) => ({ embedding: u.embedding }));
      cluster.centroid = calculateGlobalCentroid(rowsForCalc);
    } else {
      cluster.centroid = [];
    }

    let totalScore = 0;
    let scoredCount = 0;

    if (cluster.centroid.length > 0) {
      cluster.urls.forEach((u) => {
        if (u.embedding && u.embedding.length > 0) {
          const score = cosineSimilarity(u.embedding, cluster.centroid);
          if (!isNaN(score)) u.score = score;
        }
        if (u.score > 0) {
          totalScore += u.score;
          scoredCount++;
        }
      });
    }

    const total = cluster.urls.length;
    const avgScore = scoredCount === 0 ? 0 : totalScore / scoredCount;

    cluster.metrics.total_urls = total;
    cluster.metrics.avg_score = avgScore;

    return {
      total,
      avg_score: avgScore.toFixed(2),
      hasVector: cluster.centroid.length > 0,
    };
  }

  calculateClusterCentroids() {
    this.clusters.forEach((cluster) => {
      const validEntries = cluster.urls.filter(
        (u) => u.embedding && u.embedding.length > 0
      );
      if (validEntries.length > 0) {
        const rowsForCalc = validEntries.map((u) => ({
          embedding: u.embedding,
        }));
        cluster.centroid = calculateGlobalCentroid(rowsForCalc);
      }
    });
  }

  backfillScores() {
    this.clusters.forEach((cluster) => {
      if (cluster.centroid && cluster.centroid.length > 0) {
        cluster.urls.forEach((u) => {
          if (u.embedding && u.embedding.length > 0) {
            const calculatedScore = cosineSimilarity(
              u.embedding,
              cluster.centroid
            );
            if (!isNaN(calculatedScore)) {
              u.score = calculatedScore;
              const globalUrl = this.urls.get(u.url);
              if (globalUrl) {
                const assignment = globalUrl.assignments.find(
                  (a: any) => a.cluster === cluster.name
                );
                if (assignment) assignment.score = calculatedScore;
              }
            }
          }
        });
      }
    });
  }

  calculateUrlMetrics() {
    this.urls.forEach((urlObj) => {
      urlObj.assignments.sort((a: any, b: any) => b.score - a.score);
      const best = urlObj.assignments[0];
      urlObj.primary_cluster = best ? best.cluster : null;
      urlObj.max_score = best ? best.score : 0;
    });
  }

  calculateBasicMetrics() {
    this.clusters.forEach((cluster) => {
      let uniqueCount = 0;
      let totalScore = 0;
      let scoredCount = 0;

      cluster.urls.forEach((entry) => {
        if (entry.score > 0) {
          totalScore += entry.score;
          scoredCount++;
        }
        const urlData = this.urls.get(entry.url);
        if (urlData && urlData.assignments.length === 1) uniqueCount++;
      });

      const total = cluster.urls.length;
      const shared = total - uniqueCount;
      const dupRate = total === 0 ? 0 : shared / total;
      const avgScore = scoredCount === 0 ? 0 : totalScore / scoredCount;

      cluster.metrics = {
        total_urls: total,
        unique_urls: uniqueCount,
        shared_urls: shared,
        duplication_rate: dupRate,
        avg_score: avgScore,
        health_status: "Pending",
      };
    });
  }

  calculateHybridOverlaps(config: AnalysisConfig) {
    const clusterList = Array.from(this.clusters.values());

    clusterList.forEach((source) => {
      const candidates: any[] = [];
      clusterList.forEach((target) => {
        if (source.name === target.name) return;

        // Filter out small targets (<10 URLs) to prevent merging into noise
        if (target.metrics.total_urls < 10) return;

        let intersectionCount = 0;
        source.urls.forEach((u) => {
          if (target.urlSet.has(u.url)) intersectionCount++;
        });
        const overlapPct =
          source.metrics.total_urls > 0
            ? intersectionCount / source.metrics.total_urls
            : 0;
        let vectorSim = 0;
        if (source.centroid.length > 0 && target.centroid.length > 0) {
          vectorSim = cosineSimilarity(source.centroid, target.centroid);
        }
        let matchScore = 0;
        let type = "Structural";
        if (overlapPct > 0.1 || vectorSim > 0.75) {
          if (overlapPct > vectorSim) {
            matchScore = overlapPct;
            type = "Structural";
          } else {
            matchScore = vectorSim;
            type = "Semantic";
          }
          candidates.push({
            name: target.name,
            count: intersectionCount,
            percent: overlapPct,
            type: type,
            similarity: vectorSim,
            targetSize: target.metrics.total_urls,
            score: matchScore,
          });
        }
      });

      // FIX: Sort by score first, but use Target Size as tie-breaker
      // This solves the "100% match" issue by preferring the largest bucket.
      candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.targetSize - a.targetSize;
      });

      source.candidates = candidates.slice(0, 5);
      source.topMatch = candidates[0] || null;
    });
  }

  determineHierarchy(config: AnalysisConfig) {
    this.clusters.forEach((c) => {
      c.children = [];
      c.role = "Orphan";
    });
    this.clusters.forEach((source) => {
      const match = source.topMatch;
      if (!match) return;
      if (
        (match.type === "Structural" &&
          match.percent >= config.mergeThreshold) ||
        (match.type === "Semantic" &&
          match.similarity >= config.vectorThreshold)
      ) {
        const parentCluster = this.clusters.get(match.name);
        if (parentCluster) {
          if (parentCluster.metrics.total_urls > source.metrics.total_urls) {
            source.role = "Child";
            parentCluster.children.push(source.name);
            parentCluster.role = "Parent";
          }
        }
      }
    });
  }

  // --- UPDATED: MERGE ONLY FOR >10 URLS ---
  determineFinalHealth(config: AnalysisConfig) {
    this.clusters.forEach((c) => {
      const { duplication_rate, avg_score, total_urls } = c.metrics;
      const match = c.topMatch;

      let status = "Healthy";
      let rec = "Healthy";
      let issue = "None";

      const isLowVolume = total_urls < config.minUrlCount;
      const isLowQuality = avg_score < config.minAvgScore && avg_score > 0;
      const isBroken = isLowVolume || isLowQuality;

      // 1. HARD STOP: Sunset small junk (< 5 URLs)
      if (total_urls < 5) {
        status = "Sunset";
        issue = "Low Volume";

        if (match && match.similarity >= 0.9) {
          rec = `Sunset (Merge)`;
          c.target_cluster = match.name;
        } else {
          rec = `Sunset`;
          c.target_cluster = null;
        }
      }
      // 2. PRIORITY: MERGE LOGIC (Only if Source >= 10 OR matched by "Sunset Merge" above)
      else if (
        match &&
        (c.role === "Child" ||
          match.percent >= config.mergeThreshold ||
          match.similarity >= config.vectorThreshold)
      ) {
        // CASE A: I am the SMALLER partner
        if (total_urls < match.targetSize) {
          // Safety: Target too small?
          if (match.targetSize < config.minUrlCount) {
            status = "Review";
            rec = "Review (Target too small)";
            issue = "Isolation";
          }
          // FIX: Prevent "Merge" suggestions for clusters with 5-9 URLs
          else if (total_urls < config.minUrlCount) {
            status = "Review";
            rec = "Review (Low Vol)";
            issue = "Low Volume";
          }
          // Strategic Merge (Source >= 10)
          else {
            status = "Review";
            issue = "Intent Overlap";
            rec = `Consider Merge - Analyse Intent`;
          }
        }
        // CASE B: I am the BIGGER partner
        else {
          status = "Healthy";
          rec = "Dominant Cluster";
        }
      }
      // 3. PRIORITY: Quality Issues
      else if (isLowQuality) {
        status = "Review";
        rec = `Review Quality`;
        issue = "Low Quality";
      }
      // 4. PRIORITY: Volume Issues
      else if (isLowVolume) {
        status = "Review";
        rec = `Review (Low Vol)`;
        issue = "Low Volume";
      }
      // 5. PRIORITY: Fragmentation
      else if (duplication_rate >= config.maxDupRate) {
        status = "Review";
        rec = `Review (High Dup)`;
        issue = "Fragmentation";
      }

      c.metrics.health_status = status;
      c.recommendation = rec;
      c.issueType = issue;
    });
  }

  findMissedOpportunities(
    targetClusterName: string,
    minMatch: number,
    maxCurrent: number
  ) {
    const targetCluster = this.clusters.get(targetClusterName);
    if (
      !targetCluster ||
      !targetCluster.centroid ||
      targetCluster.centroid.length === 0
    )
      return [];

    const opportunities: any[] = [];

    this.urls.forEach((uObj) => {
      const isAlreadyHere = uObj.assignments.some(
        (a: any) => a.cluster === targetClusterName
      );
      if (isAlreadyHere) return;

      let embedding = uObj.assignments[0]?.embedding;
      if (!embedding) {
        const foundEntry = this.rawData.find(
          (r) => r.url === uObj.url && r.embedding
        );
        if (foundEntry) embedding = foundEntry.embedding;
      }

      if (!embedding || embedding.length === 0) return;

      const newScore = cosineSimilarity(embedding, targetCluster.centroid);
      if (newScore < minMatch) return;

      let currentScore = uObj.max_score || 0;
      const primaryClusterName = uObj.primary_cluster;
      if (currentScore === 0 && primaryClusterName) {
        const primaryCluster = this.clusters.get(primaryClusterName);
        if (primaryCluster && primaryCluster.centroid.length > 0) {
          currentScore = cosineSimilarity(embedding, primaryCluster.centroid);
        }
      }

      let isImprovement = false;
      if (currentScore < 0.01) {
        if (newScore > 0.85) isImprovement = true;
      } else {
        if (currentScore < maxCurrent && newScore > currentScore + 0.02)
          isImprovement = true;
      }

      if (isImprovement) {
        opportunities.push({
          url: uObj.url,
          current_cluster: uObj.primary_cluster || "Unassigned",
          current_score: currentScore,
          new_score: newScore,
          improvement: newScore - currentScore,
          embedding: embedding,
        });
      }
    });

    return opportunities.sort((a, b) => b.new_score - a.new_score);
  }

  calculateDrift(targetClusterName: string, threshold = 0.65) {
    const targetCluster = this.clusters.get(targetClusterName);
    if (
      !targetCluster ||
      !targetCluster.centroid ||
      targetCluster.centroid.length === 0
    )
      return [];

    const driftItems: any[] = [];

    targetCluster.urls.forEach((entry) => {
      if (!entry.embedding || entry.embedding.length === 0) return;
      const score = cosineSimilarity(entry.embedding, targetCluster.centroid);

      if (score < threshold) {
        let bestAltCluster = null;
        let bestAltScore = 0;

        this.clusters.forEach((otherCluster) => {
          if (otherCluster.name === targetClusterName) return;
          if (otherCluster.centroid.length === 0) return;

          const altScore = cosineSimilarity(
            entry.embedding,
            otherCluster.centroid
          );

          if (altScore > score && altScore > bestAltScore && altScore >= 0.82) {
            bestAltScore = altScore;
            bestAltCluster = otherCluster.name;
          }
        });

        driftItems.push({
          url: entry.url,
          cluster: targetClusterName,
          score: score,
          suggested_cluster: bestAltCluster,
          suggested_score: bestAltScore,
          embedding: entry.embedding,
        });
      }
    });

    return driftItems.sort((a, b) => a.score - b.score);
  }

  getResults() {
    return Array.from(this.clusters.values()).map((c) => ({
      cluster_name: c.name,
      metrics: c.metrics,
      candidates: c.candidates,
      children: c.children,
      recommendation: c.recommendation,
      total: c.metrics.total_urls,
      shared: c.metrics.shared_urls,
      dup_percent: (c.metrics.duplication_rate * 100).toFixed(1) + "%",
      avg_score: c.centroid.length > 0 ? c.metrics.avg_score.toFixed(2) : "N/A",
      health: c.metrics.health_status,
      top_overlap: c.topMatch
        ? `${c.topMatch.name} (${(c.topMatch.percent * 100).toFixed(1)}%)`
        : "-",
      target_cluster: c.topMatch ? c.topMatch.name : null,
      role: c.role,
      issue: c.issueType,
    }));
  }

  getDeepUrlAnalysis() {
    return Array.from(this.urls.values()).map((u) => {
      const count = u.assignments.length;
      let status = { label: "✅ Unique", color: "#34a853" };
      if (count === 2) status = { label: "2 Clusters", color: "#3b82f6" };
      else if (count <= 4)
        status = { label: "⚠⚠ 3-4 Clusters", color: "#ea4335" };
      else status = { label: "🚨 5+ Clusters", color: "#ea4335" };
      return {
        url: u.url,
        count: count,
        assignments: u.assignments,
        status: status,
        lowest: u.assignments[count - 1],
      };
    });
  }

  cosineSimilarity(vecA: number[], vecB: number[]) {
    return cosineSimilarity(vecA, vecB);
  }
}
export default ClusterAnalysisEngine;
