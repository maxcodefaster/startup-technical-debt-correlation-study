import { db } from "./db/db";
import {
  companies,
  fundingRounds,
  repositoryInfo,
  codeSnapshots,
} from "./db/schema";
import dashboard from "./dashboard/index.html";

// Get analytics data from database
async function getAnalyticsData() {
  try {
    const companiesData = await db.select().from(companies);
    const fundingRoundsData = await db.select().from(fundingRounds);
    const codeSnapshotsData = await db.select().from(codeSnapshots);
    const repositoryInfoData = await db.select().from(repositoryInfo);

    return {
      companies: companiesData,
      fundingRounds: fundingRoundsData,
      codeSnapshots: codeSnapshotsData,
      repositoryInfo: repositoryInfoData,
      exportDate: new Date().toISOString(),
      totalCompanies: companiesData.length,
      totalSnapshots: codeSnapshotsData.length,
    };
  } catch (error) {
    console.error("❌ Error fetching analytics data:", error);
    throw error;
  }
}

export async function startDashboardServer() {
  console.log("🌐 Starting analytics dashboard server...");

  const server = Bun.serve({
    port: 3000,
    routes: {
      // Serve dashboard HTML using Bun's HTML imports
      "/": dashboard,

      // API endpoint for analytics data
      "/api/analysis-data": async () => {
        try {
          const data = await getAnalyticsData();
          return Response.json(data);
        } catch (error) {
          console.error("API Error:", error);
          return Response.json(
            { error: "Failed to fetch analytics data" },
            { status: 500 }
          );
        }
      },

      // Summary stats endpoint
      "/api/stats": async () => {
        try {
          const data = await getAnalyticsData();
          const stats = {
            totalCompanies: data.companies.length,
            totalSnapshots: data.codeSnapshots.length,
            successfulAnalyses: data.codeSnapshots.filter(
              (s) => s.analysisSuccess
            ).length,
            avgTechnicalDebt:
              data.codeSnapshots.reduce(
                (sum, s) => sum + (s.technicalDebtRatio || 0),
                0
              ) / data.codeSnapshots.length,
            exportDate: data.exportDate,
          };
          return Response.json(stats);
        } catch (error) {
          return Response.json(
            { error: "Failed to generate stats" },
            { status: 500 }
          );
        }
      },

      // 404 for unmatched API routes
      "/api/*": Response.json(
        { error: "API endpoint not found" },
        { status: 404 }
      ),
    },

    // Fallback for any unmatched routes
    fetch(request) {
      return new Response("Not Found", { status: 404 });
    },

    // Error handling
    error(error) {
      console.error("Server error:", error);
      return new Response("Internal Server Error", { status: 500 });
    },
  });

  console.log(`✅ Dashboard server running at: ${server.url}`);
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
