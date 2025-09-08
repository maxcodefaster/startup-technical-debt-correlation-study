import { db } from "./db/db";
import {
  companies,
  fundingRounds,
  repositoryInfo,
  codeSnapshots,
} from "./db/schema";

// Enhanced types for analytics
interface EnrichedSnapshot {
  id: number;
  companyId: number;
  company: any;
  round: any;
  repositoryInfo: any;
  snapshotDate: string;

  // Core metrics
  linesOfCode: number;
  totalLines: number;
  complexity: number;
  cognitiveComplexity: number;
  totalFunctions: number;
  totalClasses: number;
  totalFields: number;

  // Quality metrics
  totalIssues: number;
  totalEffortMinutes: number;
  duplicatedCode: number;
  similarCode: number;
  highComplexityFunctions: number;
  highComplexityFiles: number;

  // Derived metrics
  technicalDebtRatio: number;
  complexityDensity: number;
  issuesDensity: number;
  duplicationPercentage: number;
  avgComplexityPerFunction: number;
  codebaseAge: number; // days since first commit

  // Parsed JSON data
  issuesByCategory: Record<string, number>;
  issuesByLevel: Record<string, number>;
  issuesByLanguage: Record<string, number>;

  analysisSuccess: boolean;
  [key: string]: any;
}

interface ComprehensiveAnalytics {
  summary: {
    totalCompanies: number;
    totalSnapshots: number;
    avgLinesOfCode: number;
    avgComplexity: number;
    seriesBSuccessRate: number;
    avgCodebaseAge: number;
    topLanguages: Array<{ language: string; usage: number }>;
  };

  coreAnalysis: {
    codeGrowthAnalysis: any;
    complexityEvolutionAnalysis: any;
    qualityMetricsVsExitAnalysis: any;
    repositoryCharacteristicsAnalysis: any;
    languageTechnologyAnalysis: any;
    temporalTrendsAnalysis: any;
    codeSmellImpactAnalysis: any;
    scaleCorrelationAnalysis: any;
    qualityThresholdsAnalysis: any;
    multiDimensionalAnalysis: any;
  };

  keyInsights: string[];
  strongestCorrelations: Array<{
    metric1: string;
    metric2: string;
    correlation: number;
    strength: string;
    insight: string;
  }>;

  exportDate: string;
}

// Utility functions
function calculateCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;

  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i]!, 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

  const correlation =
    (n * sumXY - sumX * sumY) /
    Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  return isNaN(correlation) ? 0 : correlation;
}

function getCorrelationStrength(r: number): string {
  const abs = Math.abs(r);
  if (abs >= 0.7) return "Very Strong";
  if (abs >= 0.5) return "Strong";
  if (abs >= 0.3) return "Moderate";
  if (abs >= 0.1) return "Weak";
  return "Very Weak";
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toFixed(0);
}

function parseJsonField(jsonStr: string | null): Record<string, number> {
  if (!jsonStr) return {};
  try {
    return JSON.parse(jsonStr);
  } catch {
    return {};
  }
}

// Main analytics calculation function
export async function calculateComprehensiveAnalytics(): Promise<ComprehensiveAnalytics> {
  console.log("📊 Calculating comprehensive analytics...");

  // Fetch all data with relations
  const companiesData = await db.select().from(companies);
  const fundingRoundsData = await db.select().from(fundingRounds);
  const codeSnapshotsData = await db.select().from(codeSnapshots);
  const repositoryInfoData = await db.select().from(repositoryInfo);

  // Create enriched snapshots with all metrics
  const enrichedSnapshots: EnrichedSnapshot[] = codeSnapshotsData
    .filter((s) => s.analysisSuccess)
    .map((snapshot) => {
      const company = companiesData.find((c) => c.id === snapshot.companyId);
      const round = fundingRoundsData.find(
        (r) => r.id === snapshot.fundingRoundId
      );
      const repoInfo = repositoryInfoData.find(
        (r) => r.id === snapshot.repositoryInfoId
      );

      // Calculate derived metrics
      const linesOfCode = snapshot.linesOfCode || 0;
      const totalIssues = snapshot.totalIssues || 0;
      const duplicatedCode = snapshot.duplicatedCode || 0;
      const totalFunctions = snapshot.totalFunctions || 0;
      const complexity = snapshot.complexity || 0;

      const duplicationPercentage =
        linesOfCode > 0 ? (duplicatedCode / linesOfCode) * 100 : 0;
      const avgComplexityPerFunction =
        totalFunctions > 0 ? complexity / totalFunctions : 0;

      // Calculate codebase age
      let codebaseAge = 0;
      if (repoInfo?.firstCommitDate && snapshot.snapshotDate) {
        const firstCommit = new Date(repoInfo.firstCommitDate);
        const snapshotDate = new Date(snapshot.snapshotDate);
        codebaseAge = Math.max(
          0,
          (snapshotDate.getTime() - firstCommit.getTime()) /
            (1000 * 60 * 60 * 24)
        );
      }

      return {
        ...snapshot,
        company,
        round,
        repositoryInfo: repoInfo,

        // Ensure numeric values
        linesOfCode,
        totalLines: snapshot.totalLines || 0,
        complexity,
        cognitiveComplexity: snapshot.cognitiveComplexity || 0,
        totalFunctions,
        totalClasses: snapshot.totalClasses || 0,
        totalFields: snapshot.totalFields || 0,
        totalIssues,
        totalEffortMinutes: snapshot.totalEffortMinutes || 0,
        duplicatedCode,
        similarCode: snapshot.similarCode || 0,
        highComplexityFunctions: snapshot.highComplexityFunctions || 0,
        highComplexityFiles: snapshot.highComplexityFiles || 0,

        // Derived metrics
        technicalDebtRatio: snapshot.technicalDebtRatio || 0,
        complexityDensity: snapshot.complexityDensity || 0,
        issuesDensity: snapshot.issuesDensity || 0,
        duplicationPercentage,
        avgComplexityPerFunction,
        codebaseAge,

        // Parse JSON fields
        issuesByCategory: parseJsonField(snapshot.issuesByCategory),
        issuesByLevel: parseJsonField(snapshot.issuesByLevel),
        issuesByLanguage: parseJsonField(snapshot.issuesByLanguage),
      };
    });

  console.log(`📈 Analyzing ${enrichedSnapshots.length} enriched snapshots...`);

  // Calculate comprehensive analytics
  const coreAnalysis = {
    codeGrowthAnalysis: analyzeCodeGrowth(enrichedSnapshots, fundingRoundsData),
    complexityEvolutionAnalysis: analyzeComplexityEvolution(enrichedSnapshots),
    qualityMetricsVsExitAnalysis: analyzeQualityVsExit(
      enrichedSnapshots,
      companiesData
    ),
    repositoryCharacteristicsAnalysis:
      analyzeRepositoryCharacteristics(enrichedSnapshots),
    languageTechnologyAnalysis: analyzeLanguageTechnology(enrichedSnapshots),
    temporalTrendsAnalysis: analyzeTemporalTrends(enrichedSnapshots),
    codeSmellImpactAnalysis: analyzeCodeSmellImpact(
      enrichedSnapshots,
      fundingRoundsData
    ),
    scaleCorrelationAnalysis: analyzeScaleCorrelations(enrichedSnapshots),
    qualityThresholdsAnalysis: analyzeQualityThresholds(
      enrichedSnapshots,
      fundingRoundsData
    ),
    multiDimensionalAnalysis: analyzeMultiDimensional(
      enrichedSnapshots,
      fundingRoundsData
    ),
  };

  // Calculate summary metrics
  const summary = calculateSummaryMetrics(
    enrichedSnapshots,
    companiesData,
    fundingRoundsData
  );

  // Find strongest correlations across all analyses
  const strongestCorrelations = findStrongestCorrelations(enrichedSnapshots);

  // Generate key insights
  const keyInsights = generateKeyInsights(
    coreAnalysis,
    strongestCorrelations,
    summary
  );

  return {
    summary,
    coreAnalysis,
    keyInsights,
    strongestCorrelations,
    exportDate: new Date().toISOString(),
  };
}

// 1. Code Growth Analysis
function analyzeCodeGrowth(
  snapshots: EnrichedSnapshot[],
  fundingRounds: any[]
) {
  console.log("  📈 Analyzing code growth patterns...");

  const growthData: Array<{
    companyId: number;
    companyName: string;
    fromRound: string;
    toRound: string;
    locGrowthRate: number;
    complexityGrowthRate: number;
    timeMonths: number;
    fundingSuccess: boolean;
  }> = [];

  // Group snapshots by company
  const snapshotsByCompany = snapshots.reduce((acc, s) => {
    if (!acc[s.companyId]) acc[s.companyId] = [];
    acc[s.companyId].push(s);
    return acc;
  }, {} as Record<number, EnrichedSnapshot[]>);

  Object.entries(snapshotsByCompany).forEach(
    ([companyId, companySnapshots]) => {
      const sorted = companySnapshots.sort(
        (a, b) =>
          new Date(a.snapshotDate).getTime() -
          new Date(b.snapshotDate).getTime()
      );

      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];

        if (prev.linesOfCode > 0 && curr.linesOfCode > 0) {
          const timeDiff =
            (new Date(curr.snapshotDate).getTime() -
              new Date(prev.snapshotDate).getTime()) /
            (1000 * 60 * 60 * 24 * 30);

          const locGrowthRate =
            (((curr.linesOfCode - prev.linesOfCode) / prev.linesOfCode) * 100) /
            timeDiff;
          const complexityGrowthRate =
            prev.complexity > 0
              ? (((curr.complexity - prev.complexity) / prev.complexity) *
                  100) /
                timeDiff
              : 0;

          // Check if company got next round after current snapshot
          const nextRounds = fundingRounds.filter(
            (r) =>
              r.companyId === parseInt(companyId) &&
              new Date(r.roundDate) > new Date(curr.snapshotDate)
          );

          growthData.push({
            companyId: parseInt(companyId),
            companyName: curr.company?.name || "Unknown",
            fromRound: prev.round?.roundType || "unknown",
            toRound: curr.round?.roundType || "unknown",
            locGrowthRate,
            complexityGrowthRate,
            timeMonths: timeDiff,
            fundingSuccess: nextRounds.length > 0,
          });
        }
      }
    }
  );

  const locGrowthCorrelation = calculateCorrelation(
    growthData.map((d) => d.locGrowthRate),
    growthData.map((d) => (d.fundingSuccess ? 1 : 0))
  );

  const complexityGrowthCorrelation = calculateCorrelation(
    growthData.map((d) => d.complexityGrowthRate),
    growthData.map((d) => (d.fundingSuccess ? 1 : 0))
  );

  return {
    growthData,
    locGrowthCorrelation,
    complexityGrowthCorrelation,
    insights: [
      `LOC growth rate correlation with funding success: ${locGrowthCorrelation.toFixed(
        3
      )} (${getCorrelationStrength(locGrowthCorrelation)})`,
      `Complexity growth rate correlation: ${complexityGrowthCorrelation.toFixed(
        3
      )} (${getCorrelationStrength(complexityGrowthCorrelation)})`,
      `Average LOC growth: ${(
        growthData.reduce((sum, d) => sum + d.locGrowthRate, 0) /
        growthData.length
      ).toFixed(1)}% per month`,
    ],
  };
}

// 2. Complexity Evolution Analysis
function analyzeComplexityEvolution(snapshots: EnrichedSnapshot[]) {
  console.log("  🧠 Analyzing complexity evolution...");

  const complexityByRound: Record<
    string,
    {
      complexities: number[];
      avgComplexities: number[];
      maxComplexities: number[];
    }
  > = {};

  snapshots.forEach((s) => {
    if (!s.round) return;
    const roundType = s.round.roundType;

    if (!complexityByRound[roundType]) {
      complexityByRound[roundType] = {
        complexities: [],
        avgComplexities: [],
        maxComplexities: [],
      };
    }

    complexityByRound[roundType].complexities.push(s.complexity);
    complexityByRound[roundType].avgComplexities.push(
      s.avgComplexityPerFunction
    );
    complexityByRound[roundType].maxComplexities.push(s.complexity); // Using total as proxy for max
  });

  const evolutionData = Object.entries(complexityByRound).map(
    ([round, data]) => ({
      roundType: round,
      avgTotalComplexity:
        data.complexities.reduce((a, b) => a + b, 0) / data.complexities.length,
      avgFunctionComplexity:
        data.avgComplexities.reduce((a, b) => a + b, 0) /
        data.avgComplexities.length,
      companyCount: data.complexities.length,
    })
  );

  return {
    evolutionData,
    insights: [
      `Complexity tracked across ${
        Object.keys(complexityByRound).length
      } funding stages`,
      `Highest average complexity in ${
        evolutionData.reduce((max, curr) =>
          curr.avgTotalComplexity > max.avgTotalComplexity ? curr : max
        ).roundType
      }`,
    ],
  };
}

// 3. Quality Metrics vs Exit Analysis
function analyzeQualityVsExit(snapshots: EnrichedSnapshot[], companies: any[]) {
  console.log("  🎯 Analyzing quality metrics vs exit outcomes...");

  const exitAnalysis: Record<
    string,
    {
      duplicationPercentages: number[];
      complexityDensities: number[];
      issuesDensities: number[];
      linesOfCode: number[];
    }
  > = {};

  // Get latest snapshot for each company
  const latestSnapshots = new Map<number, EnrichedSnapshot>();
  snapshots.forEach((s) => {
    const existing = latestSnapshots.get(s.companyId);
    if (
      !existing ||
      new Date(s.snapshotDate) > new Date(existing.snapshotDate)
    ) {
      latestSnapshots.set(s.companyId, s);
    }
  });

  latestSnapshots.forEach((snapshot) => {
    const company = companies.find((c) => c.id === snapshot.companyId);
    if (!company) return;

    const exitState = company.exitState || "none";
    if (!exitAnalysis[exitState]) {
      exitAnalysis[exitState] = {
        duplicationPercentages: [],
        complexityDensities: [],
        issuesDensities: [],
        linesOfCode: [],
      };
    }

    exitAnalysis[exitState].duplicationPercentages.push(
      snapshot.duplicationPercentage
    );
    exitAnalysis[exitState].complexityDensities.push(
      snapshot.complexityDensity
    );
    exitAnalysis[exitState].issuesDensities.push(snapshot.issuesDensity);
    exitAnalysis[exitState].linesOfCode.push(snapshot.linesOfCode);
  });

  const exitMetrics = Object.entries(exitAnalysis).map(
    ([exitState, metrics]) => ({
      exitState,
      avgDuplication:
        metrics.duplicationPercentages.reduce((a, b) => a + b, 0) /
        metrics.duplicationPercentages.length,
      avgComplexityDensity:
        metrics.complexityDensities.reduce((a, b) => a + b, 0) /
        metrics.complexityDensities.length,
      avgIssuesDensity:
        metrics.issuesDensities.reduce((a, b) => a + b, 0) /
        metrics.issuesDensities.length,
      avgLinesOfCode:
        metrics.linesOfCode.reduce((a, b) => a + b, 0) /
        metrics.linesOfCode.length,
      companyCount: metrics.duplicationPercentages.length,
    })
  );

  return {
    exitMetrics,
    insights: exitMetrics.map(
      (m) =>
        `${m.exitState}: ${m.avgDuplication.toFixed(
          1
        )}% duplication, ${m.avgComplexityDensity.toFixed(
          1
        )} complexity density (${m.companyCount} companies)`
    ),
  };
}

// 4. Repository Characteristics Analysis
function analyzeRepositoryCharacteristics(snapshots: EnrichedSnapshot[]) {
  console.log("  📁 Analyzing repository characteristics...");

  const characteristics = snapshots
    .filter((s) => s.repositoryInfo)
    .map((s) => ({
      companyName: s.company?.name || "Unknown",
      repoSizeMB: s.repositoryInfo.repoSizeMB || 0,
      totalFiles: s.repositoryInfo.totalFiles || 0,
      commitCount: s.repositoryInfo.commitCount || 0,
      codebaseAge: s.codebaseAge,
      linesOfCode: s.linesOfCode,
      fundingAmount: s.round?.amountUsd || 0,
      roundType: s.round?.roundType || "unknown",
    }))
    .filter((c) => c.repoSizeMB > 0 && c.linesOfCode > 0);

  const sizeCorrelation = calculateCorrelation(
    characteristics.map((c) => c.repoSizeMB),
    characteristics.map((c) => Math.log(c.fundingAmount + 1))
  );

  const filesCorrelation = calculateCorrelation(
    characteristics.map((c) => c.totalFiles),
    characteristics.map((c) => c.linesOfCode)
  );

  const ageCorrelation = calculateCorrelation(
    characteristics.map((c) => c.codebaseAge),
    characteristics.map((c) => Math.log(c.fundingAmount + 1))
  );

  return {
    characteristics,
    correlations: {
      sizeVsFunding: sizeCorrelation,
      filesVsLOC: filesCorrelation,
      ageVsFunding: ageCorrelation,
    },
    insights: [
      `Repo size vs funding correlation: ${sizeCorrelation.toFixed(
        3
      )} (${getCorrelationStrength(sizeCorrelation)})`,
      `Files vs LOC correlation: ${filesCorrelation.toFixed(
        3
      )} (${getCorrelationStrength(filesCorrelation)})`,
      `Codebase age vs funding correlation: ${ageCorrelation.toFixed(
        3
      )} (${getCorrelationStrength(ageCorrelation)})`,
    ],
  };
}

// 5. Language/Technology Analysis
function analyzeLanguageTechnology(snapshots: EnrichedSnapshot[]) {
  console.log("  💻 Analyzing language and technology patterns...");

  const languageStats: Record<
    string,
    {
      companies: Set<number>;
      avgComplexity: number[];
      avgIssues: number[];
      fundingAmounts: number[];
    }
  > = {};

  snapshots.forEach((s) => {
    Object.entries(s.issuesByLanguage).forEach(([lang, count]) => {
      if (count > 0) {
        if (!languageStats[lang]) {
          languageStats[lang] = {
            companies: new Set(),
            avgComplexity: [],
            avgIssues: [],
            fundingAmounts: [],
          };
        }

        languageStats[lang].companies.add(s.companyId);
        languageStats[lang].avgComplexity.push(s.avgComplexityPerFunction);
        languageStats[lang].avgIssues.push(s.issuesDensity);
        if (s.round?.amountUsd) {
          languageStats[lang].fundingAmounts.push(s.round.amountUsd);
        }
      }
    });
  });

  const languageAnalysis = Object.entries(languageStats)
    .filter(([_, stats]) => stats.companies.size >= 3) // Only languages used by 3+ companies
    .map(([language, stats]) => ({
      language,
      companyCount: stats.companies.size,
      avgComplexity:
        stats.avgComplexity.reduce((a, b) => a + b, 0) /
        stats.avgComplexity.length,
      avgIssuesDensity:
        stats.avgIssues.reduce((a, b) => a + b, 0) / stats.avgIssues.length,
      avgFunding:
        stats.fundingAmounts.length > 0
          ? stats.fundingAmounts.reduce((a, b) => a + b, 0) /
            stats.fundingAmounts.length
          : 0,
    }))
    .sort((a, b) => b.companyCount - a.companyCount);

  return {
    languageAnalysis,
    insights: [
      `Top languages: ${languageAnalysis
        .slice(0, 3)
        .map((l) => `${l.language} (${l.companyCount} companies)`)
        .join(", ")}`,
      `Language with highest funding: ${
        languageAnalysis.reduce((max, curr) =>
          curr.avgFunding > max.avgFunding ? curr : max
        ).language
      }`,
    ],
  };
}

// Continue with remaining analysis functions...
// I'll add the rest in the next update to keep this manageable

// 6. Temporal Trends Analysis
function analyzeTemporalTrends(snapshots: EnrichedSnapshot[]) {
  console.log("  📅 Analyzing temporal trends...");

  // Group snapshots by year and quarter
  const timeGroups: Record<
    string,
    {
      snapshots: EnrichedSnapshot[];
      avgTechDebt: number;
      avgComplexity: number;
      avgLOC: number;
      fundingSuccessRate: number;
    }
  > = {};

  snapshots.forEach((s) => {
    const date = new Date(s.snapshotDate);
    const year = date.getFullYear();
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    const timeKey = `${year}-Q${quarter}`;

    if (!timeGroups[timeKey]) {
      timeGroups[timeKey] = {
        snapshots: [],
        avgTechDebt: 0,
        avgComplexity: 0,
        avgLOC: 0,
        fundingSuccessRate: 0,
      };
    }

    timeGroups[timeKey].snapshots.push(s);
  });

  // Calculate metrics for each time period
  const timeData = Object.entries(timeGroups)
    .map(([timeKey, group]) => {
      const snapshots = group.snapshots;
      const avgTechDebt =
        snapshots.reduce((sum, s) => sum + s.technicalDebtRatio, 0) /
        snapshots.length;
      const avgComplexity =
        snapshots.reduce((sum, s) => sum + s.avgComplexityPerFunction, 0) /
        snapshots.length;
      const avgLOC =
        snapshots.reduce((sum, s) => sum + s.linesOfCode, 0) / snapshots.length;

      // Calculate funding success rate for companies in this period
      const companiesWithFollowOn = new Set();
      snapshots.forEach((s) => {
        if (s.round && s.round.roundType !== "exit") {
          // Check if company has funding rounds after this snapshot
          const laterRounds = snapshots.filter(
            (later) =>
              later.companyId === s.companyId &&
              new Date(later.snapshotDate) > new Date(s.snapshotDate)
          );
          if (laterRounds.length > 0) {
            companiesWithFollowOn.add(s.companyId);
          }
        }
      });

      const uniqueCompanies = new Set(snapshots.map((s) => s.companyId)).size;
      const fundingSuccessRate =
        uniqueCompanies > 0
          ? (companiesWithFollowOn.size / uniqueCompanies) * 100
          : 0;

      return {
        timeKey,
        snapshotCount: snapshots.length,
        avgTechDebt: avgTechDebt * 100,
        avgComplexity,
        avgLOC,
        fundingSuccessRate,
      };
    })
    .sort((a, b) => a.timeKey.localeCompare(b.timeKey));

  // Calculate trends
  const techDebtTrend = calculateCorrelation(
    timeData.map((_, i) => i), // time index
    timeData.map((d) => d.avgTechDebt)
  );

  const complexityTrend = calculateCorrelation(
    timeData.map((_, i) => i),
    timeData.map((d) => d.avgComplexity)
  );

  const successTrend = calculateCorrelation(
    timeData.map((_, i) => i),
    timeData.map((d) => d.fundingSuccessRate)
  );

  return {
    timeData,
    trends: {
      techDebtTrend,
      complexityTrend,
      successTrend,
    },
    insights: [
      `Technical debt trend over time: ${techDebtTrend.toFixed(
        3
      )} (${getCorrelationStrength(techDebtTrend)})`,
      `Complexity trend over time: ${complexityTrend.toFixed(
        3
      )} (${getCorrelationStrength(complexityTrend)})`,
      `Funding success trend over time: ${successTrend.toFixed(
        3
      )} (${getCorrelationStrength(successTrend)})`,
      `Analyzed ${timeData.length} time periods with ${snapshots.length} total snapshots`,
    ],
  };
}

// 7. Code Smell Impact Analysis
function analyzeCodeSmellImpact(
  snapshots: EnrichedSnapshot[],
  fundingRounds: any[]
) {
  console.log("  🐛 Analyzing code smell impact...");

  // Analyze impact of specific code smells on funding success
  const smellMetrics = [
    { name: "duplicatedCode", label: "Duplicated Code" },
    { name: "similarCode", label: "Similar Code" },
    { name: "highComplexityFunctions", label: "High Complexity Functions" },
    { name: "highComplexityFiles", label: "High Complexity Files" },
    { name: "manyParameterFunctions", label: "Many Parameter Functions" },
    { name: "complexBooleanLogic", label: "Complex Boolean Logic" },
    { name: "deeplyNestedCode", label: "Deeply Nested Code" },
    { name: "manyReturnStatements", label: "Many Return Statements" },
  ];

  const smellImpactData = smellMetrics
    .map((metric) => {
      // Get companies that have next funding rounds
      const companiesWithNextRound = new Set();
      fundingRounds.forEach((round) => {
        const laterRounds = fundingRounds.filter(
          (r) =>
            r.companyId === round.companyId &&
            new Date(r.roundDate) > new Date(round.roundDate)
        );
        if (laterRounds.length > 0) {
          companiesWithNextRound.add(round.companyId);
        }
      });

      // Calculate correlation between this smell and funding success
      const validSnapshots = snapshots.filter(
        (s) => s[metric.name] !== undefined && s[metric.name] !== null
      );

      const smellValues = validSnapshots.map((s) => s[metric.name]);
      const successValues = validSnapshots.map((s) =>
        companiesWithNextRound.has(s.companyId) ? 1 : 0
      );

      const correlation = calculateCorrelation(smellValues, successValues);

      // Calculate average values for successful vs unsuccessful companies
      const successfulSnapshots = validSnapshots.filter((s) =>
        companiesWithNextRound.has(s.companyId)
      );
      const unsuccessfulSnapshots = validSnapshots.filter(
        (s) => !companiesWithNextRound.has(s.companyId)
      );

      const avgSuccessful =
        successfulSnapshots.length > 0
          ? successfulSnapshots.reduce((sum, s) => sum + s[metric.name], 0) /
            successfulSnapshots.length
          : 0;
      const avgUnsuccessful =
        unsuccessfulSnapshots.length > 0
          ? unsuccessfulSnapshots.reduce((sum, s) => sum + s[metric.name], 0) /
            unsuccessfulSnapshots.length
          : 0;

      return {
        smellType: metric.label,
        correlation,
        correlationStrength: getCorrelationStrength(correlation),
        avgSuccessful,
        avgUnsuccessful,
        difference: avgUnsuccessful - avgSuccessful,
        sampleSize: validSnapshots.length,
      };
    })
    .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

  // Find categories with strongest impact
  const strongestSmells = smellImpactData.filter(
    (s) => Math.abs(s.correlation) > 0.1
  );

  return {
    smellImpactData,
    strongestSmells,
    insights: [
      `Analyzed ${smellMetrics.length} code smell types across ${snapshots.length} snapshots`,
      strongestSmells.length > 0
        ? `Strongest code smell predictor: ${
            strongestSmells[0].smellType
          } (r=${strongestSmells[0].correlation.toFixed(3)})`
        : "No code smells show strong correlation with funding success",
      `${strongestSmells.length} code smells show meaningful correlation (>0.1) with funding outcomes`,
    ],
  };
}

// 8. Scale Correlation Analysis
function analyzeScaleCorrelations(snapshots: EnrichedSnapshot[]) {
  console.log("  📏 Analyzing scale correlations...");

  // Define scale metrics
  const scaleMetrics = snapshots
    .map((s) => ({
      companyId: s.companyId,
      companyName: s.company?.name || "Unknown",
      linesOfCode: s.linesOfCode,
      totalFiles: s.repositoryInfo?.totalFiles || 0,
      commitCount: s.repositoryInfo?.commitCount || 0,
      codebaseAge: s.codebaseAge,
      totalFunctions: s.totalFunctions,
      totalClasses: s.totalClasses,
      repoSizeMB: s.repositoryInfo?.repoSizeMB || 0,

      // Derived scale metrics
      linesPerFile:
        s.repositoryInfo?.totalFiles > 0
          ? s.linesOfCode / s.repositoryInfo.totalFiles
          : 0,
      functionsPerClass:
        s.totalClasses > 0 ? s.totalFunctions / s.totalClasses : 0,
      commitsPerDay:
        s.codebaseAge > 0
          ? (s.repositoryInfo?.commitCount || 0) / s.codebaseAge
          : 0,
      growthRate: s.codebaseAge > 0 ? s.linesOfCode / s.codebaseAge : 0, // LOC per day

      // Quality metrics for correlation
      technicalDebtRatio: s.technicalDebtRatio,
      complexityDensity: s.complexityDensity,
      issuesDensity: s.issuesDensity,
      duplicationPercentage: s.duplicationPercentage,

      // Success metrics
      fundingAmount: s.round?.amountUsd || 0,
      roundType: s.round?.roundType || "unknown",
    }))
    .filter((m) => m.linesOfCode > 0);

  // Calculate correlations between scale and quality metrics
  const scaleQualityCorrelations = [
    {
      scaleMetric: "Lines of Code",
      qualityMetric: "Technical Debt Ratio",
      correlation: calculateCorrelation(
        scaleMetrics.map((m) => Math.log(m.linesOfCode + 1)),
        scaleMetrics.map((m) => m.technicalDebtRatio)
      ),
    },
    {
      scaleMetric: "Repository Size (MB)",
      qualityMetric: "Complexity Density",
      correlation: calculateCorrelation(
        scaleMetrics.map((m) => Math.log(m.repoSizeMB + 1)),
        scaleMetrics.map((m) => m.complexityDensity)
      ),
    },
    {
      scaleMetric: "Codebase Age (days)",
      qualityMetric: "Duplication Percentage",
      correlation: calculateCorrelation(
        scaleMetrics.map((m) => Math.log(m.codebaseAge + 1)),
        scaleMetrics.map((m) => m.duplicationPercentage)
      ),
    },
    {
      scaleMetric: "Growth Rate (LOC/day)",
      qualityMetric: "Issues Density",
      correlation: calculateCorrelation(
        scaleMetrics.map((m) => Math.log(m.growthRate + 1)),
        scaleMetrics.map((m) => m.issuesDensity)
      ),
    },
    {
      scaleMetric: "Lines per File",
      qualityMetric: "Technical Debt Ratio",
      correlation: calculateCorrelation(
        scaleMetrics.map((m) => m.linesPerFile),
        scaleMetrics.map((m) => m.technicalDebtRatio)
      ),
    },
  ];

  // Scale vs funding correlations
  const scaleFundingCorrelations = [
    {
      scaleMetric: "Lines of Code",
      correlation: calculateCorrelation(
        scaleMetrics.map((m) => Math.log(m.linesOfCode + 1)),
        scaleMetrics.map((m) => Math.log(m.fundingAmount + 1))
      ),
    },
    {
      scaleMetric: "Repository Size (MB)",
      correlation: calculateCorrelation(
        scaleMetrics.map((m) => Math.log(m.repoSizeMB + 1)),
        scaleMetrics.map((m) => Math.log(m.fundingAmount + 1))
      ),
    },
    {
      scaleMetric: "Total Functions",
      correlation: calculateCorrelation(
        scaleMetrics.map((m) => Math.log(m.totalFunctions + 1)),
        scaleMetrics.map((m) => Math.log(m.fundingAmount + 1))
      ),
    },
  ];

  // Find strongest correlations
  const strongestScaleQuality = scaleQualityCorrelations.sort(
    (a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)
  )[0];
  const strongestScaleFunding = scaleFundingCorrelations.sort(
    (a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)
  )[0];

  return {
    scaleMetrics,
    scaleQualityCorrelations,
    scaleFundingCorrelations,
    insights: [
      `Strongest scale-quality correlation: ${
        strongestScaleQuality.scaleMetric
      } vs ${
        strongestScaleQuality.qualityMetric
      } (r=${strongestScaleQuality.correlation.toFixed(3)})`,
      `Strongest scale-funding correlation: ${
        strongestScaleFunding.scaleMetric
      } (r=${strongestScaleFunding.correlation.toFixed(3)})`,
      `Analyzed ${scaleMetrics.length} repositories for scale patterns`,
      Math.abs(strongestScaleQuality.correlation) > 0.3
        ? `Strong scale-quality relationship found: ${getCorrelationStrength(
            strongestScaleQuality.correlation
          )}`
        : "No strong scale-quality relationships detected",
    ],
  };
}

// 9. Quality Thresholds Analysis
function analyzeQualityThresholds(
  snapshots: EnrichedSnapshot[],
  fundingRounds: any[]
) {
  console.log("  🎯 Analyzing quality thresholds...");

  // Get companies with next funding rounds
  const companiesWithNextRound = new Set();
  fundingRounds.forEach((round) => {
    const laterRounds = fundingRounds.filter(
      (r) =>
        r.companyId === round.companyId &&
        new Date(r.roundDate) > new Date(round.roundDate)
    );
    if (laterRounds.length > 0) {
      companiesWithNextRound.add(round.companyId);
    }
  });

  // Define quality metrics to analyze for thresholds
  const qualityMetrics = [
    {
      name: "technicalDebtRatio",
      label: "Technical Debt Ratio",
      unit: "%",
      multiplier: 100,
    },
    {
      name: "complexityDensity",
      label: "Complexity Density",
      unit: "",
      multiplier: 1,
    },
    {
      name: "issuesDensity",
      label: "Issues Density",
      unit: "per 1000 LOC",
      multiplier: 1,
    },
    {
      name: "duplicationPercentage",
      label: "Code Duplication",
      unit: "%",
      multiplier: 1,
    },
    {
      name: "avgComplexityPerFunction",
      label: "Avg Function Complexity",
      unit: "",
      multiplier: 1,
    },
  ];

  const thresholdAnalysis = qualityMetrics.map((metric) => {
    const validSnapshots = snapshots.filter(
      (s) =>
        s[metric.name] !== undefined &&
        s[metric.name] !== null &&
        !isNaN(s[metric.name])
    );

    if (validSnapshots.length < 10) {
      return {
        metric: metric.label,
        thresholds: [],
        optimalThreshold: null,
        insights: [`Insufficient data for ${metric.label} threshold analysis`],
      };
    }

    // Sort snapshots by metric value
    const sortedSnapshots = validSnapshots.sort(
      (a, b) => a[metric.name] - b[metric.name]
    );

    // Test different percentile thresholds
    const thresholds = [];
    for (let percentile = 10; percentile <= 90; percentile += 10) {
      const thresholdIndex = Math.floor(
        (percentile / 100) * sortedSnapshots.length
      );
      const thresholdValue = sortedSnapshots[thresholdIndex][metric.name];

      // Calculate success rates above and below threshold
      const belowThreshold = validSnapshots.filter(
        (s) => s[metric.name] <= thresholdValue
      );
      const aboveThreshold = validSnapshots.filter(
        (s) => s[metric.name] > thresholdValue
      );

      const belowSuccessRate =
        belowThreshold.length > 0
          ? (belowThreshold.filter((s) =>
              companiesWithNextRound.has(s.companyId)
            ).length /
              belowThreshold.length) *
            100
          : 0;
      const aboveSuccessRate =
        aboveThreshold.length > 0
          ? (aboveThreshold.filter((s) =>
              companiesWithNextRound.has(s.companyId)
            ).length /
              aboveThreshold.length) *
            100
          : 0;

      const successDifference = belowSuccessRate - aboveSuccessRate;

      thresholds.push({
        percentile,
        thresholdValue: thresholdValue * metric.multiplier,
        belowSuccessRate,
        aboveSuccessRate,
        successDifference,
        belowCount: belowThreshold.length,
        aboveCount: aboveThreshold.length,
      });
    }

    // Find optimal threshold (highest success difference)
    const optimalThreshold = thresholds.reduce((best, current) =>
      Math.abs(current.successDifference) > Math.abs(best.successDifference)
        ? current
        : best
    );

    return {
      metric: metric.label,
      unit: metric.unit,
      thresholds,
      optimalThreshold,
      insights: [
        `Optimal ${
          metric.label
        } threshold: ${optimalThreshold.thresholdValue.toFixed(2)}${
          metric.unit
        }`,
        `Companies below threshold: ${optimalThreshold.belowSuccessRate.toFixed(
          1
        )}% success rate`,
        `Companies above threshold: ${optimalThreshold.aboveSuccessRate.toFixed(
          1
        )}% success rate`,
        `Success difference: ${Math.abs(
          optimalThreshold.successDifference
        ).toFixed(1)} percentage points`,
      ],
    };
  });

  // Find most predictive thresholds
  const strongestThresholds = thresholdAnalysis
    .filter(
      (t) =>
        t.optimalThreshold && Math.abs(t.optimalThreshold.successDifference) > 5
    )
    .sort(
      (a, b) =>
        Math.abs(b.optimalThreshold!.successDifference) -
        Math.abs(a.optimalThreshold!.successDifference)
    );

  return {
    thresholdAnalysis,
    strongestThresholds,
    insights: [
      `Analyzed thresholds for ${qualityMetrics.length} quality metrics`,
      strongestThresholds.length > 0
        ? `Most predictive threshold: ${
            strongestThresholds[0].metric
          } (${Math.abs(
            strongestThresholds[0].optimalThreshold!.successDifference
          ).toFixed(1)}% difference)`
        : "No highly predictive quality thresholds found",
      `${strongestThresholds.length} metrics show >5% success rate difference at optimal thresholds`,
    ],
  };
}

// 10. Multi-Dimensional Analysis
function analyzeMultiDimensional(
  snapshots: EnrichedSnapshot[],
  fundingRounds: any[]
) {
  console.log("  🔀 Analyzing multi-dimensional patterns...");

  // Get funding success data
  const companiesWithNextRound = new Set();
  fundingRounds.forEach((round) => {
    const laterRounds = fundingRounds.filter(
      (r) =>
        r.companyId === round.companyId &&
        new Date(r.roundDate) > new Date(round.roundDate)
    );
    if (laterRounds.length > 0) {
      companiesWithNextRound.add(round.companyId);
    }
  });

  // Create multi-dimensional feature vectors
  const features = snapshots
    .map((s) => ({
      companyId: s.companyId,
      companyName: s.company?.name || "Unknown",

      // Normalized features (0-1 scale)
      techDebtScore: Math.min(s.technicalDebtRatio, 2) / 2, // Cap at 200%
      complexityScore: Math.min(s.complexityDensity, 100) / 100,
      duplicationScore: Math.min(s.duplicationPercentage, 50) / 50,
      issuesScore: Math.min(s.issuesDensity, 200) / 200,
      scaleScore: Math.min(Math.log(s.linesOfCode + 1), 15) / 15, // Log scale
      ageScore: Math.min(s.codebaseAge, 1000) / 1000,

      // Raw values for analysis
      technicalDebtRatio: s.technicalDebtRatio,
      complexityDensity: s.complexityDensity,
      duplicationPercentage: s.duplicationPercentage,
      issuesDensity: s.issuesDensity,
      linesOfCode: s.linesOfCode,
      codebaseAge: s.codebaseAge,

      // Success indicator
      fundingSuccess: companiesWithNextRound.has(s.companyId) ? 1 : 0,
      roundType: s.round?.roundType || "unknown",
    }))
    .filter(
      (f) =>
        !isNaN(f.techDebtScore) &&
        !isNaN(f.complexityScore) &&
        !isNaN(f.duplicationScore) &&
        !isNaN(f.issuesScore)
    );

  // Calculate composite quality scores
  const qualityScores = features.map((f) => ({
    ...f,
    // Composite scores (lower is better)
    qualityScore:
      (f.techDebtScore +
        f.complexityScore +
        f.duplicationScore +
        f.issuesScore) /
      4,
    scaleQualityRatio: f.scaleScore / (f.techDebtScore + 0.1), // Scale relative to tech debt
    maturityScore: f.ageScore * (1 - f.techDebtScore), // Age discounted by tech debt
  }));

  // Analyze composite score correlations
  const compositeCorrelations = [
    {
      name: "Quality Score",
      correlation: calculateCorrelation(
        qualityScores.map((q) => q.qualityScore),
        qualityScores.map((q) => q.fundingSuccess)
      ),
    },
    {
      name: "Scale-Quality Ratio",
      correlation: calculateCorrelation(
        qualityScores.map((q) => q.scaleQualityRatio),
        qualityScores.map((q) => q.fundingSuccess)
      ),
    },
    {
      name: "Maturity Score",
      correlation: calculateCorrelation(
        qualityScores.map((q) => q.maturityScore),
        qualityScores.map((q) => q.fundingSuccess)
      ),
    },
  ];

  // Segment analysis - divide into quality quintiles
  const sortedByQuality = qualityScores.sort(
    (a, b) => a.qualityScore - b.qualityScore
  );
  const quintileSize = Math.floor(sortedByQuality.length / 5);

  const quintileAnalysis = [];
  for (let i = 0; i < 5; i++) {
    const start = i * quintileSize;
    const end = i === 4 ? sortedByQuality.length : (i + 1) * quintileSize;
    const quintileCompanies = sortedByQuality.slice(start, end);

    const successRate =
      quintileCompanies.length > 0
        ? (quintileCompanies.filter((c) => c.fundingSuccess).length /
            quintileCompanies.length) *
          100
        : 0;

    quintileAnalysis.push({
      quintile: i + 1,
      label: [
        "Highest Quality",
        "High Quality",
        "Medium Quality",
        "Low Quality",
        "Lowest Quality",
      ][i],
      companiesCount: quintileCompanies.length,
      successRate,
      avgQualityScore:
        quintileCompanies.reduce((sum, c) => sum + c.qualityScore, 0) /
        quintileCompanies.length,
      avgTechDebt:
        quintileCompanies.reduce((sum, c) => sum + c.technicalDebtRatio, 0) /
        quintileCompanies.length,
    });
  }

  // Find best composite predictor
  const strongestComposite = compositeCorrelations.sort(
    (a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)
  )[0];

  return {
    features,
    qualityScores,
    compositeCorrelations,
    quintileAnalysis,
    insights: [
      `Strongest composite predictor: ${
        strongestComposite.name
      } (r=${strongestComposite.correlation.toFixed(3)})`,
      `Quality quintile analysis shows ${quintileAnalysis[0].successRate.toFixed(
        1
      )}% vs ${quintileAnalysis[4].successRate.toFixed(1)}% success rates`,
      `Multi-dimensional analysis reveals ${Math.abs(
        quintileAnalysis[0].successRate - quintileAnalysis[4].successRate
      ).toFixed(
        1
      )} percentage point difference between highest and lowest quality companies`,
      `Composite quality score correlates ${getCorrelationStrength(
        strongestComposite.correlation
      ).toLowerCase()} with funding success`,
    ],
  };
}

function calculateSummaryMetrics(
  snapshots: EnrichedSnapshot[],
  companies: any[],
  fundingRounds: any[]
) {
  const totalCompanies = companies.length;
  const totalSnapshots = snapshots.length;
  const avgLinesOfCode =
    snapshots.reduce((sum, s) => sum + s.linesOfCode, 0) / snapshots.length;
  const avgComplexity =
    snapshots.reduce((sum, s) => sum + s.complexity, 0) / snapshots.length;
  const avgCodebaseAge =
    snapshots.reduce((sum, s) => sum + s.codebaseAge, 0) / snapshots.length;

  // Calculate Series B success rate
  const seriesACompanies = new Set(
    fundingRounds
      .filter((r) => r.roundType === "series_a")
      .map((r) => r.companyId)
  );
  const seriesBCompanies = new Set(
    fundingRounds
      .filter((r) => r.roundType === "series_b")
      .map((r) => r.companyId)
  );
  const seriesBSuccessRate =
    seriesACompanies.size > 0
      ? (seriesBCompanies.size / seriesACompanies.size) * 100
      : 0;

  // Top languages
  const allLanguages: Record<string, number> = {};
  snapshots.forEach((s) => {
    Object.entries(s.issuesByLanguage).forEach(([lang, count]) => {
      allLanguages[lang] = (allLanguages[lang] || 0) + count;
    });
  });

  const topLanguages = Object.entries(allLanguages)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([language, usage]) => ({ language, usage }));

  return {
    totalCompanies,
    totalSnapshots,
    avgLinesOfCode,
    avgComplexity,
    seriesBSuccessRate,
    avgCodebaseAge,
    topLanguages,
  };
}

function findStrongestCorrelations(snapshots: EnrichedSnapshot[]) {
  const correlations: Array<{
    metric1: string;
    metric2: string;
    correlation: number;
    strength: string;
    insight: string;
  }> = [];

  // Define metrics to correlate
  const metrics = [
    { name: "Lines of Code", values: snapshots.map((s) => s.linesOfCode) },
    { name: "Complexity", values: snapshots.map((s) => s.complexity) },
    {
      name: "Duplication %",
      values: snapshots.map((s) => s.duplicationPercentage),
    },
    { name: "Issues Density", values: snapshots.map((s) => s.issuesDensity) },
    { name: "Codebase Age", values: snapshots.map((s) => s.codebaseAge) },
    { name: "Total Functions", values: snapshots.map((s) => s.totalFunctions) },
    {
      name: "Funding Amount",
      values: snapshots.map((s) => Math.log((s.round?.amountUsd || 0) + 1)),
    },
  ];

  // Calculate all pairwise correlations
  for (let i = 0; i < metrics.length; i++) {
    for (let j = i + 1; j < metrics.length; j++) {
      const correlation = calculateCorrelation(
        metrics[i].values,
        metrics[j].values
      );
      const strength = getCorrelationStrength(correlation);

      if (Math.abs(correlation) > 0.1) {
        // Only include non-trivial correlations
        correlations.push({
          metric1: metrics[i].name,
          metric2: metrics[j].name,
          correlation,
          strength,
          insight: `${
            correlation > 0 ? "Positive" : "Negative"
          } ${strength.toLowerCase()} correlation between ${
            metrics[i].name
          } and ${metrics[j].name}`,
        });
      }
    }
  }

  return correlations
    .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
    .slice(0, 10);
}

function generateKeyInsights(
  coreAnalysis: any,
  strongestCorrelations: any[],
  summary: any
) {
  const insights = [
    `Analyzed ${summary.totalCompanies} companies with ${summary.totalSnapshots} code snapshots`,
    `Average codebase size: ${formatNumber(
      summary.avgLinesOfCode
    )} lines of code`,
    `Average codebase age: ${Math.round(summary.avgCodebaseAge)} days`,
    `Top programming language: ${
      summary.topLanguages[0]?.language || "Unknown"
    }`,
  ];

  // Add insights from strongest correlations
  if (strongestCorrelations.length > 0) {
    insights.push(
      `Strongest correlation: ${
        strongestCorrelations[0].insight
      } (r=${strongestCorrelations[0].correlation.toFixed(3)})`
    );
  }

  return insights;
}
