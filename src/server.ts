import { calculateFundingOutcomeAnalysis } from "./analytics";
import dashboard from "./dashboard/index.html";

export async function startDashboardServer() {
  console.log("🌐 Starting Technical Debt & Funding Analytics Dashboard...");

  const server = Bun.serve({
    port: 3000,
    routes: {
      "/": dashboard,

      "/api/funding-analytics": async () => {
        try {
          const data = await calculateFundingOutcomeAnalysis();
          return Response.json(data);
        } catch (error) {
          console.error("Funding analytics error:", error);
          return Response.json(
            { error: "Failed to calculate funding analytics" },
            { status: 500 }
          );
        }
      },

      // Keep legacy endpoint for backward compatibility
      "/api/tdv-analytics": async () => {
        try {
          const data = await calculateFundingOutcomeAnalysis();
          return Response.json(data);
        } catch (error) {
          return Response.json(
            { error: "Failed to calculate analytics" },
            { status: 500 }
          );
        }
      },

      "/api/*": () =>
        Response.json({ error: "API endpoint not found" }, { status: 404 }),
    },

    fetch(request) {
      return new Response("Not Found", { status: 404 });
    },

    error(error) {
      console.error("Server error:", error);
      return new Response("Internal Server Error", { status: 500 });
    },
  });

  console.log(`✅ Technical Debt & Funding Dashboard: ${server.url}`);
  console.log("🔍 Press Ctrl+C to stop");

  return new Promise((resolve) => {
    process.on("SIGINT", () => {
      console.log("\n🛑 Shutting down...");
      server.stop();
      resolve(undefined);
    });
  });
}
