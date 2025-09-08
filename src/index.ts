import { db, importCSV } from "./db/db";
import {
  companies,
  fundingRounds,
  repositoryInfo,
  codeSnapshots,
} from "./db/schema";
import { eq } from "drizzle-orm";
import { GitHandler } from "./git";
import { QltyAnalyzer } from "./qlty";
import { startDashboardServer } from "./server";
import fs from "fs";

function displayMenu() {
  console.log("\n🚀 Startup Technical Debt Analysis System");
  console.log("=".repeat(50));
  console.log("Choose an option:");
  console.log("1. 📊 Import & Analyze Technical Debt Data");
  console.log("2. 🌐 Serve Analytics Dashboard");
  console.log("3. 🗑️ Clean all repos and start fresh");
  console.log("4. 📤 Export analytics data to JSON");
  console.log("5. ❌ Exit");
  console.log("=".repeat(50));
}

async function getUserChoice(): Promise<string> {
  console.log("\nEnter your choice (1-5): ");
  for await (const line of console) {
    return line.trim();
  }
  return "5";
}

async function processCompany(company: any) {
  console.log(`\n📈 Processing: ${company.name}`);

  const gitHandler = new GitHandler(company.name, false);

  try {
    console.log(`📥 Cloning/reusing ${company.githubLink}`);
    const repoPath = await gitHandler.cloneRepo(company.githubLink);

    // Get all funding rounds for this company
    const rounds = await db
      .select()
      .from(fundingRounds)
      .where(eq(fundingRounds.companyId, company.id));

    // Add exit date as a special "round" if exists
    const analysisPoints = [...rounds];
    if (company.exitDate) {
      analysisPoints.push({
        id: -1,
        companyId: company.id,
        roundType: "exit",
        roundDate: company.exitDate,
        amountUsd: null,
        isExtension: false,
        createdAt: null,
      });
    }

    // Sort by date to ensure chronological order
    analysisPoints.sort(
      (a, b) =>
        new Date(a.roundDate).getTime() - new Date(b.roundDate).getTime()
    );

    for (const round of analysisPoints) {
      console.log(`  📍 Analyzing ${round.roundType} at ${round.roundDate}`);

      // Checkout to date
      const commitHash = await gitHandler.checkoutDate(round.roundDate);
      if (!commitHash) {
        console.log(`  ⚠️ Failed to checkout ${round.roundDate}, skipping...`);
        continue;
      }

      // Analyze repository structure
      const repoInfo = await gitHandler.analyzeRepository();

      // Insert repository info
      const [repositoryInfoRecord] = await db
        .insert(repositoryInfo)
        .values({
          companyId: company.id,
          analysisDate: round.roundDate,
          totalFiles: repoInfo.totalFiles,
          repoSizeMB: repoInfo.repoSizeMB,
          commitCount: repoInfo.commitCount,
          firstCommitDate: repoInfo.firstCommitDate,
          lastCommitDate: repoInfo.lastCommitDate,
        })
        .returning();

      // Run Qlty analysis
      const qltyAnalyzer = new QltyAnalyzer(
        repoPath,
        "./data/analysis_results",
        company.name,
        round.roundDate,
        round.roundType
      );
      const qltyMetrics = await qltyAnalyzer.runAnalysis();

      // Insert code snapshot
      await db.insert(codeSnapshots).values({
        companyId: company.id,
        fundingRoundId: round.id > 0 ? round.id : null,
        repositoryInfoId: repositoryInfoRecord!.id,
        snapshotDate: round.roundDate,
        commitHash,

        // Core metrics from metrics.txt
        linesOfCode: qltyMetrics.linesOfCode,
        totalLines: qltyMetrics.totalLines,
        complexity: qltyMetrics.complexity,
        cognitiveComplexity: qltyMetrics.cognitiveComplexity,
        totalFunctions: qltyMetrics.totalFunctions,
        totalClasses: qltyMetrics.totalClasses,
        totalFields: qltyMetrics.totalFields,
        lackOfCohesion: qltyMetrics.lackOfCohesion,

        // Aggregated smells data
        totalIssues: qltyMetrics.totalIssues,
        totalEffortMinutes: qltyMetrics.totalEffortMinutes,
        averageEffortPerIssue: qltyMetrics.averageEffortPerIssue,
        issuesByCategory: qltyMetrics.issuesByCategory,
        issuesByLevel: qltyMetrics.issuesByLevel,
        issuesByLanguage: qltyMetrics.issuesByLanguage,

        // Legacy fields for backward compatibility
        duplicatedCode: qltyMetrics.duplicatedCode,
        similarCode: qltyMetrics.similarCode,
        highComplexityFunctions: qltyMetrics.highComplexityFunctions,
        highComplexityFiles: qltyMetrics.highComplexityFiles,
        manyParameterFunctions: qltyMetrics.manyParameterFunctions,
        complexBooleanLogic: qltyMetrics.complexBooleanLogic,
        deeplyNestedCode: qltyMetrics.deeplyNestedCode,
        manyReturnStatements: qltyMetrics.manyReturnStatements,

        // Derived quality metrics
        totalCodeSmells: qltyMetrics.totalCodeSmells,
        averageComplexity: qltyMetrics.averageComplexity,
        maxComplexity: qltyMetrics.maxComplexity,
        complexityDensity: qltyMetrics.complexityDensity,
        issuesDensity: qltyMetrics.issuesDensity,
        technicalDebtMinutes: qltyMetrics.technicalDebtMinutes,
        technicalDebtRatio: qltyMetrics.technicalDebtRatio,

        // Analysis metadata
        analysisSuccess: qltyMetrics.analysisSuccess,
        analysisErrors: qltyMetrics.analysisErrors,
        qltyVersion: qltyMetrics.qltyVersion,
      });

      console.log(
        `  ✅ Completed ${round.roundType} (LOC: ${qltyMetrics.linesOfCode}, Issues: ${qltyMetrics.totalCodeSmells})`
      );
    }

    console.log(`✅ Completed all analyses for ${company.name}`);
  } catch (error) {
    console.error(
      `❌ Failed to process ${company.name}:`,
      (error as Error).message
    );
  } finally {
    gitHandler.cleanup();
  }
}

async function runAnalysis() {
  console.log("🚀 Starting Technical Debt Analysis");
  console.log("=".repeat(50));

  // Check for existing repos
  const existingRepos = GitHandler.listExistingRepos();
  if (existingRepos.length > 0) {
    console.log(`📁 Found ${existingRepos.length} existing repos`);
    console.log("💡 Repos will be reused to save time.");
  }

  // Import CSV if provided
  const csvPath = process.argv[2] || "./data/startup_seed_data.csv";

  if (csvPath && fs.existsSync(csvPath)) {
    console.log(`📊 Importing data from ${csvPath}...`);
    await importCSV(csvPath);
    console.log();
  }

  // Get all companies
  const allCompanies = await db.select().from(companies);

  if (allCompanies.length === 0) {
    console.log(
      "❌ No companies found in database. Please import CSV data first."
    );
    console.log("Usage: bun run start <csv-file>");
    return;
  }

  console.log(`🏢 Processing ${allCompanies.length} companies...`);

  // Process each company sequentially
  for (let i = 0; i < allCompanies.length; i++) {
    const company = allCompanies[i];
    console.log(`\n[${i + 1}/${allCompanies.length}]`);

    await processCompany(company);

    // Small delay between companies
    if (i < allCompanies.length - 1) {
      console.log("⏳ Waiting 3 seconds before next company...");
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  console.log("\n🎉 Analysis complete!");
  console.log("=".repeat(50));

  // Summary statistics
  const totalSnapshots = await db.select().from(codeSnapshots);
  const successfulAnalyses = totalSnapshots.filter((s) => s.analysisSuccess);

  console.log(`📊 Summary:`);
  console.log(`   Companies processed: ${allCompanies.length}`);
  console.log(`   Total snapshots: ${totalSnapshots.length}`);
  console.log(`   Successful analyses: ${successfulAnalyses.length}`);
  console.log(
    `   Success rate: ${(
      (successfulAnalyses.length / totalSnapshots.length) *
      100
    ).toFixed(1)}%`
  );

  console.log(`\n💾 Data saved to: data/analysis.db`);
  console.log(`📁 Analysis results in: ./data/analysis_results/`);
  console.log(`📁 Repos kept in: ./repos/ (for debugging)`);
}

export async function exportAnalyticsData(): Promise<void> {
  console.log("📤 Exporting enhanced analytics data to JSON...");

  try {
    // Import the analytics calculation function from server
    const { calculateAnalytics } = await import("./server");

    // Get the comprehensive analytics data
    const analyticsData = await calculateAnalytics();

    // Ensure directories exist
    if (!fs.existsSync("src")) {
      fs.mkdirSync("src", { recursive: true });
    }

    if (!fs.existsSync("src/dashboard")) {
      fs.mkdirSync("src/dashboard", { recursive: true });
    }

    // Write the comprehensive analytics data
    fs.writeFileSync(
      "src/dashboard/analytics.json",
      JSON.stringify(analyticsData, null, 2)
    );

    console.log(
      "✅ Enhanced analytics data exported to: src/dashboard/analytics.json"
    );
    console.log(
      `   📊 ${analyticsData.summary.totalCompanies} companies analyzed`
    );
    console.log(
      `   📈 ${analyticsData.summary.totalSnapshots} successful code snapshots`
    );
    console.log(
      `   🎯 Series B success rate: ${analyticsData.summary.seriesBSuccessRate.toFixed(
        1
      )}%`
    );
    console.log(
      `   📋 ${
        analyticsData.coreAnalysis.seriesAVsSeriesB.insights.length +
        analyticsData.coreAnalysis.exitSuccessAnalysis.insights.length
      } insights generated`
    );
    console.log(
      `   💾 File size: ${(
        fs.statSync("src/dashboard/analytics.json").size / 1024
      ).toFixed(1)} KB`
    );

    // Also create a summary file for quick reference
    const summaryData = {
      summary: analyticsData.summary,
      keyFindings: {
        seriesAVsSeriesB: analyticsData.coreAnalysis.seriesAVsSeriesB.insights,
        exitSuccess: analyticsData.coreAnalysis.exitSuccessAnalysis.insights,
        timeGap: analyticsData.coreAnalysis.timeGapAnalysis.insights,
        fundingAmount:
          analyticsData.coreAnalysis.fundingAmountCorrelation.insights,
      },
      exportDate: analyticsData.exportDate,
    };

    fs.writeFileSync(
      "src/dashboard/summary.json",
      JSON.stringify(summaryData, null, 2)
    );

    console.log("✅ Summary insights exported to: src/dashboard/summary.json");
  } catch (error) {
    console.error("❌ Failed to export analytics data:", error);
    throw error;
  }
}

async function main() {
  while (true) {
    displayMenu();
    const choice = await getUserChoice();

    switch (choice) {
      case "1":
        await runAnalysis();
        break;

      case "2":
        console.log("🌐 Starting analytics dashboard server...");
        await exportAnalyticsData(); // Always export fresh data when serving
        await startDashboardServer();
        break;

      case "3":
        console.log("🗑️ Cleaning all existing repos...");
        GitHandler.cleanAllRepos();
        console.log("✅ All repos cleaned successfully!");
        break;

      case "4":
        await exportAnalyticsData();
        break;

      case "5":
        console.log("👋 Goodbye!");
        process.exit(0);
        break;

      default:
        console.log("❌ Invalid choice. Please enter 1-5.");
    }

    if (choice !== "2") {
      console.log("\nPress Enter to continue...");
      await getUserChoice();
    }
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Received SIGINT, shutting down gracefully...");
  console.log("📁 Repos preserved in ./repos/ for debugging");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Received SIGTERM, shutting down gracefully...");
  console.log("📁 Repos preserved in ./repos/ for debugging");
  process.exit(0);
});

// Run if called directly
if (import.meta.main) {
  main().catch((error) => {
    console.error("💥 Fatal error:", error);
    process.exit(1);
  });
}
