import { db } from "./db/db";
import {
  companies,
  fundingRounds,
  repositoryInfo,
  codeSnapshots,
} from "./db/schema";
import { calculateComprehensiveAnalytics } from "./analytics";
import dashboard from "./dashboard/index.html";

// Enhanced server with new analytics endpoints
export async function startDashboardServer() {
  console.log("🌐 Starting enhanced analytics dashboard server...");

  const server = Bun.serve({
    port: 3000,
    routes: {
      // Serve dashboard HTML
      "/": dashboard,

      // Main analytics endpoint with comprehensive pre-calculated data
      "/api/analysis-data": async () => {
        try {
          const data = await calculateComprehensiveAnalytics();
          return Response.json(data);
        } catch (error) {
          console.error("API Error:", error);
          return Response.json(
            {
              error: "Failed to fetch analytics data",
              details: (error as Error).message,
            },
            { status: 500 }
          );
        }
      },

      // Quick summary stats
      "/api/stats": async () => {
        try {
          const data = await calculateComprehensiveAnalytics();
          return Response.json(data.summary);
        } catch (error) {
          return Response.json(
            { error: "Failed to generate stats" },
            { status: 500 }
          );
        }
      },

      // Individual enhanced analysis endpoints
      "/api/code-growth": async () => {
        try {
          const data = await calculateComprehensiveAnalytics();
          return Response.json(data.coreAnalysis.codeGrowthAnalysis);
        } catch (error) {
          return Response.json(
            { error: "Failed to get code growth analysis" },
            { status: 500 }
          );
        }
      },

      "/api/complexity-evolution": async () => {
        try {
          const data = await calculateComprehensiveAnalytics();
          return Response.json(data.coreAnalysis.complexityEvolutionAnalysis);
        } catch (error) {
          return Response.json(
            { error: "Failed to get complexity evolution analysis" },
            { status: 500 }
          );
        }
      },

      "/api/quality-exit": async () => {
        try {
          const data = await calculateComprehensiveAnalytics();
          return Response.json(data.coreAnalysis.qualityMetricsVsExitAnalysis);
        } catch (error) {
          return Response.json(
            { error: "Failed to get quality vs exit analysis" },
            { status: 500 }
          );
        }
      },

      "/api/repository-characteristics": async () => {
        try {
          const data = await calculateComprehensiveAnalytics();
          return Response.json(
            data.coreAnalysis.repositoryCharacteristicsAnalysis
          );
        } catch (error) {
          return Response.json(
            { error: "Failed to get repository characteristics" },
            { status: 500 }
          );
        }
      },

      "/api/language-analysis": async () => {
        try {
          const data = await calculateComprehensiveAnalytics();
          return Response.json(data.coreAnalysis.languageTechnologyAnalysis);
        } catch (error) {
          return Response.json(
            { error: "Failed to get language analysis" },
            { status: 500 }
          );
        }
      },

      "/api/strongest-correlations": async () => {
        try {
          const data = await calculateComprehensiveAnalytics();
          return Response.json(data.strongestCorrelations);
        } catch (error) {
          return Response.json(
            { error: "Failed to get correlations" },
            { status: 500 }
          );
        }
      },

      // Raw data endpoints for debugging
      "/api/raw-snapshots": async () => {
        try {
          const snapshots = await db.select().from(codeSnapshots);
          return Response.json(snapshots.slice(0, 10)); // Limit for performance
        } catch (error) {
          return Response.json(
            { error: "Failed to fetch raw snapshots" },
            { status: 500 }
          );
        }
      },

      "/api/debug-info": async () => {
        try {
          const companiesCount = await db.select().from(companies);
          const roundsCount = await db.select().from(fundingRounds);
          const snapshotsCount = await db.select().from(codeSnapshots);
          const repoInfoCount = await db.select().from(repositoryInfo);

          return Response.json({
            companies: companiesCount.length,
            fundingRounds: roundsCount.length,
            codeSnapshots: snapshotsCount.length,
            repositoryInfo: repoInfoCount.length,
            successfulSnapshots: snapshotsCount.filter((s) => s.analysisSuccess)
              .length,
            avgTechDebtRatio:
              snapshotsCount.reduce(
                (sum, s) => sum + (s.technicalDebtRatio || 0),
                0
              ) / snapshotsCount.length,
            sampleSnapshot: snapshotsCount[0] || null,
          });
        } catch (error) {
          return Response.json(
            { error: "Failed to get debug info" },
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
  console.log(`📊 Comprehensive analytics API: ${server.url}api/analysis-data`);
  console.log(`🔍 Debug info: ${server.url}api/debug-info`);
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

// Export the analytics function for use in other modules
export { calculateComprehensiveAnalytics as calculateAnalytics };
