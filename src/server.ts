import { db } from "./db/db";
import {
  companies,
  fundingRounds,
  repositoryInfo,
  codeSnapshots,
} from "./db/schema";
import dashboard from "./dashboard/index.html";

// Types for analytics data
interface EnrichedSnapshot {
  id: number;
  companyId: number;
  company: any;
  round: any;
  snapshotDate: string;
  technicalDebtRatio: number;
  complexityDensity: number;
  issuesDensity: number;
  totalCodeSmells: number;
  linesOfCode: number;
  analysisSuccess: boolean;
  [key: string]: any;
}

interface AnalyticsData {
  // Raw data
  companies: any[];
  fundingRounds: any[];
  codeSnapshots: any[];
  repositoryInfo: any[];

  // Pre-calculated analytics
  coreAnalysis: {
    seriesAVsSeriesB: any;
    exitSuccessAnalysis: any;
    fundingTrajectoryAnalysis: any;
    timeGapAnalysis: any;
    fundingAmountCorrelation: any;
    technicalDebtEvolution: any;
  };

  // Summary metrics
  summary: {
    totalCompanies: number;
    totalSnapshots: number;
    avgTechDebt: number;
    seriesBSuccessRate: number;
    correlationMatrix: any;
    keyInsights: string[];
  };

  exportDate: string;
}

// Utility functions
function calculateCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;

  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

  const correlation =
    (n * sumXY - sumX * sumY) /
    Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  return isNaN(correlation) ? 0 : correlation;
}

function getCorrelationStrength(r: number): string {
  const abs = Math.abs(r);
  if (abs >= 0.7) return "strong";
  if (abs >= 0.3) return "moderate";
  return "weak";
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toFixed(2);
}

// Main analytics calculation function
async function calculateAnalytics(): Promise<AnalyticsData> {
  console.log("📊 Calculating comprehensive analytics...");

  // Fetch raw data
  const companiesData = await db.select().from(companies);
  const fundingRoundsData = await db.select().from(fundingRounds);
  const codeSnapshotsData = await db.select().from(codeSnapshots);
  const repositoryInfoData = await db.select().from(repositoryInfo);

  // Create enriched snapshots
  const enrichedSnapshots: EnrichedSnapshot[] = codeSnapshotsData
    .filter((s) => s.analysisSuccess)
    .map((snapshot) => {
      const company = companiesData.find((c) => c.id === snapshot.companyId);
      const round = fundingRoundsData.find(
        (r) => r.id === snapshot.fundingRoundId
      );
      return {
        ...snapshot,
        company,
        round,
        technicalDebtRatio: snapshot.technicalDebtRatio || 0,
        complexityDensity: snapshot.complexityDensity || 0,
        issuesDensity: snapshot.issuesDensity || 0,
        totalCodeSmells: snapshot.totalCodeSmells || 0,
        linesOfCode: snapshot.linesOfCode || 0,
      };
    });

  // Core Analysis Calculations
  const coreAnalysis = {
    seriesAVsSeriesB: calculateSeriesAVsSeriesB(
      enrichedSnapshots,
      fundingRoundsData
    ),
    exitSuccessAnalysis: calculateExitSuccessAnalysis(
      enrichedSnapshots,
      companiesData
    ),
    fundingTrajectoryAnalysis: calculateFundingTrajectoryAnalysis(
      enrichedSnapshots,
      fundingRoundsData,
      companiesData
    ),
    timeGapAnalysis: calculateTimeGapAnalysis(
      enrichedSnapshots,
      fundingRoundsData,
      companiesData
    ),
    fundingAmountCorrelation:
      calculateFundingAmountCorrelation(enrichedSnapshots),
    technicalDebtEvolution: calculateTechnicalDebtEvolution(enrichedSnapshots),
  };

  // Summary calculations
  const summary = calculateSummaryMetrics(
    companiesData,
    codeSnapshotsData,
    fundingRoundsData,
    enrichedSnapshots,
    coreAnalysis
  );

  return {
    companies: companiesData,
    fundingRounds: fundingRoundsData,
    codeSnapshots: codeSnapshotsData,
    repositoryInfo: repositoryInfoData,
    coreAnalysis,
    summary,
    exportDate: new Date().toISOString(),
  };
}

function calculateSeriesAVsSeriesB(
  enrichedSnapshots: EnrichedSnapshot[],
  fundingRounds: any[]
) {
  console.log("  🔍 Analyzing Series A vs Series B progression...");

  const seriesASnapshots = enrichedSnapshots.filter(
    (s) => s.round && s.round.roundType === "series_a"
  );

  const companiesWithSeriesB = new Set(
    fundingRounds
      .filter((r) => r.roundType === "series_b")
      .map((r) => r.companyId)
  );

  const data = seriesASnapshots.map((snapshot) => ({
    companyId: snapshot.companyId,
    companyName: snapshot.company?.name || "Unknown",
    technicalDebtRatio: snapshot.technicalDebtRatio,
    complexityDensity: snapshot.complexityDensity,
    totalCodeSmells: snapshot.totalCodeSmells,
    linesOfCode: snapshot.linesOfCode,
    reachedSeriesB: companiesWithSeriesB.has(snapshot.companyId),
  }));

  const seriesBGroup = data.filter((d) => d.reachedSeriesB);
  const stoppedGroup = data.filter((d) => !d.reachedSeriesB);

  const avgTechDebtSeriesB =
    seriesBGroup.length > 0
      ? seriesBGroup.reduce((sum, d) => sum + d.technicalDebtRatio, 0) /
        seriesBGroup.length
      : 0;

  const avgTechDebtStopped =
    stoppedGroup.length > 0
      ? stoppedGroup.reduce((sum, d) => sum + d.technicalDebtRatio, 0) /
        stoppedGroup.length
      : 0;

  const correlation = calculateCorrelation(
    data.map((d) => d.technicalDebtRatio),
    data.map((d) => (d.reachedSeriesB ? 1 : 0))
  );

  return {
    scatterData: data,
    successRate:
      data.length > 0 ? (seriesBGroup.length / data.length) * 100 : 0,
    avgTechDebtSeriesB: avgTechDebtSeriesB * 100,
    avgTechDebtStopped: avgTechDebtStopped * 100,
    difference: (avgTechDebtStopped - avgTechDebtSeriesB) * 100,
    correlation,
    correlationStrength: getCorrelationStrength(correlation),
    insights: [
      `${
        data.length > 0
          ? ((seriesBGroup.length / data.length) * 100).toFixed(1)
          : 0
      }% of Series A companies reached Series B`,
      `Companies that reached Series B had ${(avgTechDebtSeriesB * 100).toFixed(
        1
      )}% average technical debt`,
      `Companies that stopped at Series A had ${(
        avgTechDebtStopped * 100
      ).toFixed(1)}% average technical debt`,
      `Difference: ${Math.abs(
        (avgTechDebtStopped - avgTechDebtSeriesB) * 100
      ).toFixed(1)} percentage points ${
        avgTechDebtStopped > avgTechDebtSeriesB ? "higher" : "lower"
      } for companies that didn't reach Series B`,
    ],
  };
}

function calculateExitSuccessAnalysis(
  enrichedSnapshots: EnrichedSnapshot[],
  companies: any[]
) {
  console.log("  🎯 Analyzing exit success patterns...");

  const exitCounts = companies.reduce((acc, company) => {
    acc[company.exitState] = (acc[company.exitState] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Get latest snapshot for each company for exit analysis
  const exitTechDebt: Record<string, number[]> = {};
  companies.forEach((company) => {
    const latestSnapshot = enrichedSnapshots
      .filter((s) => s.companyId === company.id)
      .sort(
        (a, b) =>
          new Date(b.snapshotDate).getTime() -
          new Date(a.snapshotDate).getTime()
      )[0];

    if (latestSnapshot) {
      if (!exitTechDebt[company.exitState]) {
        exitTechDebt[company.exitState] = [];
      }
      exitTechDebt[company.exitState].push(latestSnapshot.technicalDebtRatio);
    }
  });

  const exitAnalysisData = Object.entries(exitTechDebt).map(
    ([state, values]) => ({
      exitState: state,
      avgTechnicalDebt: values.reduce((sum, v) => sum + v, 0) / values.length,
      companyCount: values.length,
      companies: companies
        .filter((c) => c.exitState === state)
        .map((c) => c.name),
    })
  );

  return {
    exitCounts,
    exitTechDebtData: exitAnalysisData,
    insights: exitAnalysisData.map(
      (data) =>
        `${
          data.exitState.charAt(0).toUpperCase() + data.exitState.slice(1)
        }: ${(data.avgTechnicalDebt * 100).toFixed(1)}% avg technical debt (${
          data.companyCount
        } companies)`
    ),
  };
}

function calculateFundingTrajectoryAnalysis(
  enrichedSnapshots: EnrichedSnapshot[],
  fundingRounds: any[],
  companies: any[]
) {
  console.log("  🚀 Analyzing funding trajectory patterns...");

  const trajectories: Record<string, number> = {};
  const trajectoryTechDebt: Record<string, number[]> = {};

  companies.forEach((company) => {
    const rounds = fundingRounds
      .filter((r) => r.companyId === company.id)
      .sort(
        (a, b) =>
          new Date(a.roundDate).getTime() - new Date(b.roundDate).getTime()
      );

    const maxRound = rounds[rounds.length - 1]?.roundType || "none";
    trajectories[maxRound] = (trajectories[maxRound] || 0) + 1;

    // Get Series A technical debt for trajectory analysis
    const seriesASnapshot = enrichedSnapshots.find(
      (s) => s.companyId === company.id && s.round?.roundType === "series_a"
    );

    if (seriesASnapshot) {
      if (!trajectoryTechDebt[maxRound]) {
        trajectoryTechDebt[maxRound] = [];
      }
      trajectoryTechDebt[maxRound].push(seriesASnapshot.technicalDebtRatio);
    }
  });

  const trajectoryAnalysisData = Object.entries(trajectories).map(
    ([trajectory, count]) => ({
      trajectory,
      companyCount: count,
      avgTechnicalDebt: trajectoryTechDebt[trajectory]
        ? trajectoryTechDebt[trajectory].reduce((sum, v) => sum + v, 0) /
          trajectoryTechDebt[trajectory].length
        : 0,
    })
  );

  return {
    trajectoryData: trajectoryAnalysisData,
    insights: [
      `Most companies reach ${Object.keys(trajectories).reduce((a, b) =>
        (trajectories[a] ?? 0) > (trajectories[b] ?? 0) ? a : b
      )} as their highest funding round`,
      `${Object.values(trajectories).reduce(
        (a, b) => a + b,
        0
      )} total companies analyzed across all stages`,
    ],
  };
}

function calculateTimeGapAnalysis(
  enrichedSnapshots: EnrichedSnapshot[],
  fundingRounds: any[],
  companies: any[]
) {
  console.log("  ⏱️ Analyzing time between funding rounds...");

  const timeData: Array<{
    companyId: number;
    companyName: string;
    technicalDebtRatio: number;
    timeToNextRound: number;
    fromRound: string;
    toRound: string;
  }> = [];

  companies.forEach((company) => {
    const rounds = fundingRounds
      .filter((r) => r.companyId === company.id)
      .sort(
        (a, b) =>
          new Date(a.roundDate).getTime() - new Date(b.roundDate).getTime()
      );

    for (let i = 1; i < rounds.length; i++) {
      const timeDiff =
        (new Date(rounds[i].roundDate).getTime() -
          new Date(rounds[i - 1].roundDate).getTime()) /
        (1000 * 60 * 60 * 24 * 30); // months

      const snapshot = enrichedSnapshots.find(
        (s) => s.fundingRoundId === rounds[i - 1].id
      );

      if (snapshot) {
        timeData.push({
          companyId: company.id,
          companyName: company.name,
          technicalDebtRatio: snapshot.technicalDebtRatio,
          timeToNextRound: timeDiff,
          fromRound: rounds[i - 1].roundType,
          toRound: rounds[i].roundType,
        });
      }
    }
  });

  const correlation = calculateCorrelation(
    timeData.map((d) => d.technicalDebtRatio),
    timeData.map((d) => d.timeToNextRound)
  );

  // Categorize by time gaps
  const fastFollowers = timeData.filter((d) => d.timeToNextRound <= 12);
  const normalPace = timeData.filter(
    (d) => d.timeToNextRound > 12 && d.timeToNextRound <= 24
  );
  const slowProgressors = timeData.filter((d) => d.timeToNextRound > 24);

  return {
    scatterData: timeData,
    correlation,
    correlationStrength: getCorrelationStrength(correlation),
    categories: {
      fastFollowers: {
        count: fastFollowers.length,
        avgTechDebt:
          fastFollowers.length > 0
            ? fastFollowers.reduce((sum, d) => sum + d.technicalDebtRatio, 0) /
              fastFollowers.length
            : 0,
      },
      normalPace: {
        count: normalPace.length,
        avgTechDebt:
          normalPace.length > 0
            ? normalPace.reduce((sum, d) => sum + d.technicalDebtRatio, 0) /
              normalPace.length
            : 0,
      },
      slowProgressors: {
        count: slowProgressors.length,
        avgTechDebt:
          slowProgressors.length > 0
            ? slowProgressors.reduce(
                (sum, d) => sum + d.technicalDebtRatio,
                0
              ) / slowProgressors.length
            : 0,
      },
    },
    insights: [
      `Correlation between technical debt and time to next round: ${correlation.toFixed(
        3
      )} (${getCorrelationStrength(correlation)})`,
      correlation > 0.1
        ? "Higher technical debt appears to be associated with longer times between funding rounds"
        : correlation < -0.1
        ? "Higher technical debt appears to be associated with shorter times between funding rounds"
        : "No significant correlation between technical debt and time between funding rounds",
    ],
  };
}

function calculateFundingAmountCorrelation(
  enrichedSnapshots: EnrichedSnapshot[]
) {
  console.log("  💰 Analyzing funding amount correlations...");

  const amountData = enrichedSnapshots
    .filter((s) => s.round && s.round.amountUsd)
    .map((s) => ({
      companyName: s.company.name,
      roundType: s.round.roundType,
      technicalDebtRatio: s.technicalDebtRatio,
      fundingAmount: s.round.amountUsd,
      logFundingAmount: Math.log(s.round.amountUsd),
    }));

  const correlation = calculateCorrelation(
    amountData.map((d) => d.technicalDebtRatio),
    amountData.map((d) => d.logFundingAmount)
  );

  // Analyze by funding size categories
  const largeFunding = amountData.filter((d) => d.fundingAmount >= 25);
  const mediumFunding = amountData.filter(
    (d) => d.fundingAmount >= 5 && d.fundingAmount < 25
  );
  const smallFunding = amountData.filter((d) => d.fundingAmount < 5);

  return {
    scatterData: amountData,
    correlation,
    correlationStrength: getCorrelationStrength(correlation),
    categories: {
      large: {
        count: largeFunding.length,
        avgTechDebt:
          largeFunding.length > 0
            ? largeFunding.reduce((sum, d) => sum + d.technicalDebtRatio, 0) /
              largeFunding.length
            : 0,
      },
      medium: {
        count: mediumFunding.length,
        avgTechDebt:
          mediumFunding.length > 0
            ? mediumFunding.reduce((sum, d) => sum + d.technicalDebtRatio, 0) /
              mediumFunding.length
            : 0,
      },
      small: {
        count: smallFunding.length,
        avgTechDebt:
          smallFunding.length > 0
            ? smallFunding.reduce((sum, d) => sum + d.technicalDebtRatio, 0) /
              smallFunding.length
            : 0,
      },
    },
    insights: [
      `Correlation with log(funding amount): ${correlation.toFixed(
        3
      )} (${getCorrelationStrength(correlation)})`,
      Math.abs(correlation) > 0.2
        ? `${
            correlation > 0 ? "Higher" : "Lower"
          } technical debt is associated with ${
            correlation > 0 ? "larger" : "smaller"
          } funding rounds`
        : "No significant correlation between technical debt and funding amount",
    ],
  };
}

function calculateTechnicalDebtEvolution(
  enrichedSnapshots: EnrichedSnapshot[]
) {
  console.log("  📈 Analyzing technical debt evolution...");

  const evolutionData: Record<string, number[]> = {};

  enrichedSnapshots.forEach((snapshot) => {
    if (!snapshot.round) return;

    const roundType = snapshot.round.roundType;
    if (!evolutionData[roundType]) {
      evolutionData[roundType] = [];
    }
    evolutionData[roundType].push(snapshot.technicalDebtRatio);
  });

  const roundOrder = [
    "seed",
    "series_a",
    "series_b",
    "series_c",
    "series_d",
    "series_e",
  ];
  const orderedData = roundOrder.filter((round) => evolutionData[round]);

  const evolutionSeries = orderedData.map((round) => ({
    roundType: round,
    avgTechnicalDebt:
      evolutionData[round] && evolutionData[round].length > 0
        ? evolutionData[round].reduce((sum, v) => sum + v, 0) /
          evolutionData[round].length
        : 0,
    companyCount: evolutionData[round]?.length ?? 0,
    minTechDebt:
      evolutionData[round] && evolutionData[round].length > 0
        ? Math.min(...evolutionData[round])
        : 0,
    maxTechDebt:
      evolutionData[round] && evolutionData[round].length > 0
        ? Math.max(...evolutionData[round])
        : 0,
  }));

  return {
    evolutionSeries,
    insights: [
      `Technical debt evolution tracked across ${orderedData.length} distinct funding stages`,
      `Analysis covers complete funding lifecycle from early-stage to growth rounds`,
    ],
  };
}

function calculateSummaryMetrics(
  companies: any[],
  codeSnapshots: any[],
  fundingRounds: any[],
  enrichedSnapshots: EnrichedSnapshot[],
  coreAnalysis: any
) {
  console.log("  📋 Calculating summary metrics...");

  const totalCompanies = companies.length;
  const totalSnapshots = codeSnapshots.filter((s) => s.analysisSuccess).length;

  const avgTechDebt =
    enrichedSnapshots.length > 0
      ? enrichedSnapshots.reduce((sum, s) => sum + s.technicalDebtRatio, 0) /
        enrichedSnapshots.length
      : 0;

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

  // Generate key insights
  const keyInsights = [
    `${totalCompanies} companies analyzed with ${totalSnapshots} successful code snapshots`,
    `Average technical debt ratio: ${(avgTechDebt * 100).toFixed(1)}%`,
    `Series B success rate: ${seriesBSuccessRate.toFixed(1)}%`,
    `Technical debt correlation with Series B success: ${coreAnalysis.seriesAVsSeriesB.correlation.toFixed(
      3
    )} (${coreAnalysis.seriesAVsSeriesB.correlationStrength})`,
    `Time-to-funding correlation: ${coreAnalysis.timeGapAnalysis.correlation.toFixed(
      3
    )} (${coreAnalysis.timeGapAnalysis.correlationStrength})`,
  ];

  return {
    totalCompanies,
    totalSnapshots,
    avgTechDebt: avgTechDebt * 100,
    seriesBSuccessRate,
    correlationMatrix: {
      seriesBCorrelation: coreAnalysis.seriesAVsSeriesB.correlation,
      timeCorrelation: coreAnalysis.timeGapAnalysis.correlation,
      amountCorrelation: coreAnalysis.fundingAmountCorrelation.correlation,
    },
    keyInsights,
  };
}

// Enhanced server with analytics endpoints
export async function startDashboardServer() {
  console.log("🌐 Starting enhanced analytics dashboard server...");

  const server = Bun.serve({
    port: 3000,
    routes: {
      // Serve dashboard HTML
      "/": dashboard,

      // Main analytics endpoint with pre-calculated data
      "/api/analysis-data": async () => {
        try {
          const data = await calculateAnalytics();
          return Response.json(data);
        } catch (error) {
          console.error("API Error:", error);
          return Response.json(
            { error: "Failed to fetch analytics data" },
            { status: 500 }
          );
        }
      },

      // Quick summary stats
      "/api/stats": async () => {
        try {
          const data = await calculateAnalytics();
          return Response.json(data.summary);
        } catch (error) {
          return Response.json(
            { error: "Failed to generate stats" },
            { status: 500 }
          );
        }
      },

      // Individual analysis endpoints
      "/api/series-analysis": async () => {
        try {
          const data = await calculateAnalytics();
          return Response.json(data.coreAnalysis.seriesAVsSeriesB);
        } catch (error) {
          return Response.json(
            { error: "Failed to get series analysis" },
            { status: 500 }
          );
        }
      },

      "/api/exit-analysis": async () => {
        try {
          const data = await calculateAnalytics();
          return Response.json(data.coreAnalysis.exitSuccessAnalysis);
        } catch (error) {
          return Response.json(
            { error: "Failed to get exit analysis" },
            { status: 500 }
          );
        }
      },

      // 404 for unmatched API routes
      "/api/*": () =>
        Response.json({ error: "API endpoint not found" }, { status: 404 }),
    },

    // Fallback for unmatched routes
    fetch(request) {
      return new Response("Not Found", { status: 404 });
    },

    // Error handling
    error(error) {
      console.error("Server error:", error);
      return new Response("Internal Server Error", { status: 500 });
    },
  });

  console.log(`✅ Enhanced dashboard server running at: ${server.url}`);
  console.log(`📊 Analytics API available at: ${server.url}api/analysis-data`);
  console.log(`📈 Dashboard available at: ${server.url}`);
  console.log("\n🔍 Press Ctrl+C to stop the server");

  // Keep the server running
  return new Promise((resolve) => {
    process.on("SIGINT", () => {
      console.log("\n🛑 Shutting down dashboard server...");
      server.stop();
      resolve(undefined);
    });
  });
}

export { calculateAnalytics };
