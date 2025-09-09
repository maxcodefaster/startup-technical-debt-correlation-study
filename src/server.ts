import { calculateEntrepreneurshipAnalysis } from "./analytics";
import dashboard from "./dashboard/index.html";

export async function startDashboardServer() {
  console.log(
    "🚀 Starting Entrepreneurship & Technical Debt Analytics Dashboard..."
  );

  const server = Bun.serve({
    port: 3000,
    routes: {
      "/": dashboard,

      "/api/entrepreneurship-analytics": async () => {
        try {
          const data = await calculateEntrepreneurshipAnalysis();
          return Response.json(data);
        } catch (error) {
          console.error("Entrepreneurship analytics error:", error);
          return Response.json(
            { error: "Failed to calculate entrepreneurship analytics" },
            { status: 500 }
          );
        }
      },

      // Keep legacy endpoints for backward compatibility
      "/api/funding-analytics": async () => {
        try {
          const data = await calculateEntrepreneurshipAnalysis();
          return Response.json(data);
        } catch (error) {
          console.error("Analytics error:", error);
          return Response.json(
            { error: "Failed to calculate funding analytics" },
            { status: 500 }
          );
        }
      },

      "/api/tdv-analytics": async () => {
        try {
          const data = await calculateEntrepreneurshipAnalysis();
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

  console.log(`✅ Entrepreneurship Analytics Dashboard: ${server.url}`);
  console.log(
    "📊 Analysis: Technical debt associations with venture execution"
  );
  console.log("🔍 Press Ctrl+C to stop");

  return new Promise((resolve) => {
    process.on("SIGINT", () => {
      console.log("\n🛑 Shutting down dashboard...");
      server.stop();
      resolve(undefined);
    });
  });
}
