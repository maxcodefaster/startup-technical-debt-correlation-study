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
import fs from "fs";

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

      // Run Qlty analysis with company name and round type
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

async function main() {
  console.log("🚀 Starting Startup Technical Debt Analysis");
  console.log("=".repeat(50));

  // Check for existing repos
  const existingRepos = GitHandler.listExistingRepos();
  if (existingRepos.length > 0) {
    console.log(`📁 Found ${existingRepos.length} existing repos`);
    console.log(
      "💡 Repos will be reused to save time. Use --clean to start fresh."
    );
  }

  // Import CSV if provided
  const csvPath = process.argv[2] || "./data/startup_seed_data.csv";

  // Check for --clean flag
  if (process.argv.includes("--clean")) {
    console.log("🗑️ Cleaning all existing repos...");
    GitHandler.cleanAllRepos();
  }

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
    process.exit(1);
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

  // Additional metrics summary
  if (successfulAnalyses.length > 0) {
    const totalLOC = successfulAnalyses.reduce(
      (sum, s) => sum + (s.linesOfCode || 0),
      0
    );
    const totalCodeSmells = successfulAnalyses.reduce(
      (sum, s) => sum + (s.totalCodeSmells || 0),
      0
    );
    const avgComplexity =
      successfulAnalyses.reduce(
        (sum, s) => sum + (s.averageComplexity || 0),
        0
      ) / successfulAnalyses.length;

    console.log(`\n📈 Code Quality Summary:`);
    console.log(
      `   Total lines of code analyzed: ${totalLOC.toLocaleString()}`
    );
    console.log(
      `   Total code smells found: ${totalCodeSmells.toLocaleString()}`
    );
    console.log(`   Average complexity: ${avgComplexity.toFixed(2)}`);
  }

  console.log(`\n💾 Data saved to: data/analysis.db`);
  console.log(`📁 Analysis results in: ./data/analysis_results/`);
  console.log(`📁 Repos kept in: ./repos/ (for debugging)`);
  console.log(`🔍 Use 'bun run studio' to explore the data`);
  console.log(`🗑️ Use 'bun run start --clean' to clean repos and start fresh`);
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
