import { calculateTDVAnalytics } from "./analytics";
import dashboard from "./dashboard/index.html";

export async function startDashboardServer() {
  console.log("🌐 Starting TDV Analytics Dashboard...");

  const server = Bun.serve({
    port: 3000,
    routes: {
      "/": dashboard,

      "/api/tdv-analytics": async () => {
        try {
          const data = await calculateTDVAnalytics();
          return Response.json(data);
        } catch (error) {
          return Response.json(
            { error: "Failed to calculate TDV analytics" },
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

  console.log(`✅ TDV Dashboard: ${server.url}`);
  console.log("🔍 Press Ctrl+C to stop");

  return new Promise((resolve) => {
    process.on("SIGINT", () => {
      console.log("\n🛑 Shutting down...");
      server.stop();
      resolve(undefined);
    });
  });
}
