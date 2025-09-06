import { db, importCSV } from "./db/db";
import {
  companies,
  fundingRounds,
  repositoryInfo,
  codeSnapshots,
  analysisLog,
} from "./db/schema";
import { eq } from "drizzle-orm";
import { GitHandler } from "./git";
import { QltyAnalyzer } from "./qlty";
import fs from "fs";

async function log(
  companyId: number | null,
  level: string,
  stage: string,
  message: string,
  details?: any
) {
  console.log(`[${level.toUpperCase()}] ${stage}: ${message}`);
  await db.insert(analysisLog).values({
    companyId,
    level,
    stage,
    message,
    details: details ? JSON.stringify(details) : null,
  });
}

async function processCompany(company: any) {
  await log(company.id, "info", "start", `Processing company: ${company.name}`);

  const gitHandler = new GitHandler(company.name);

  try {
    // Clone repository
    await log(company.id, "info", "clone", `Cloning ${company.githubLink}`);
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
      await log(
        company.id,
        "info",
        "checkout",
        `Analyzing ${round.roundType} at ${round.roundDate}`
      );

      // Checkout to date
      const commitHash = await gitHandler.checkoutDate(round.roundDate);
      if (!commitHash) {
        await log(
          company.id,
          "warning",
          "checkout",
          `Failed to checkout ${round.roundDate}, skipping...`
        );
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
          detectedLanguages: JSON.stringify(repoInfo.detectedLanguages),
          primaryLanguage: repoInfo.primaryLanguage,
          totalFiles: repoInfo.totalFiles,
          repoSizeMB: repoInfo.repoSizeMB,
          commitCount: repoInfo.commitCount,
          firstCommitDate: repoInfo.firstCommitDate,
          lastCommitDate: repoInfo.lastCommitDate,
          hasPackageJson: repoInfo.frameworks.hasPackageJson,
          hasPomXml: repoInfo.frameworks.hasPomXml,
          hasCargoToml: repoInfo.frameworks.hasCargoToml,
          hasGoMod: repoInfo.frameworks.hasGoMod,
          hasRequirementsTxt: repoInfo.frameworks.hasRequirementsTxt,
          hasGemfile: repoInfo.frameworks.hasGemfile,
          hasComposerJson: repoInfo.frameworks.hasComposerJson,
          detectedFrameworks: JSON.stringify(repoInfo.detectedFrameworks),
        })
        .returning();

      // Run Qlty analysis
      const qltyAnalyzer = new QltyAnalyzer(repoPath);
      const qltyMetrics = await qltyAnalyzer.runAnalysis();

      // Insert code snapshot
      await db.insert(codeSnapshots).values({
        companyId: company.id,
        fundingRoundId: round.id > 0 ? round.id : null,
        repositoryInfoId: repositoryInfoRecord!.id,
        snapshotDate: round.roundDate,
        commitHash,
        linesOfCode: qltyMetrics.linesOfCode,
        complexity: qltyMetrics.complexity,
        cognitiveComplexity: qltyMetrics.cognitiveComplexity,
        duplicatedCode: qltyMetrics.duplicatedCode,
        similarCode: qltyMetrics.similarCode,
        highComplexityFunctions: qltyMetrics.highComplexityFunctions,
        highComplexityFiles: qltyMetrics.highComplexityFiles,
        manyParameterFunctions: qltyMetrics.manyParameterFunctions,
        complexBooleanLogic: qltyMetrics.complexBooleanLogic,
        deeplyNestedCode: qltyMetrics.deeplyNestedCode,
        manyReturnStatements: qltyMetrics.manyReturnStatements,
        totalCodeSmells: qltyMetrics.totalCodeSmells,
        duplicatedLinesPercentage: qltyMetrics.duplicatedLinesPercentage,
        averageComplexity: qltyMetrics.averageComplexity,
        maxComplexity: qltyMetrics.maxComplexity,
        totalFunctions: qltyMetrics.totalFunctions,
        totalClasses: qltyMetrics.totalClasses,
        analysisSuccess: qltyMetrics.analysisSuccess,
        analysisErrors: qltyMetrics.analysisErrors,
        qltyVersion: qltyMetrics.qltyVersion,
      });

      await log(
        company.id,
        "info",
        "analysis",
        `Completed analysis for ${round.roundType}`,
        {
          commit: commitHash,
          linesOfCode: qltyMetrics.linesOfCode,
          totalCodeSmells: qltyMetrics.totalCodeSmells,
          complexity: qltyMetrics.complexity,
        }
      );
    }

    await log(
      company.id,
      "info",
      "complete",
      `Completed all analyses for ${company.name}`
    );
  } catch (error) {
    await log(
      company.id,
      "error",
      "process",
      `Failed to process company: ${(error as Error).message}`,
      { error: (error as Error).stack }
    );
  } finally {
    // Always clean up
    gitHandler.cleanup();
  }
}

async function main() {
  console.log("🚀 Starting Startup Technical Debt Analysis with Qlty");
  console.log("=".repeat(50));

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
    process.exit(1);
  }

  console.log(`🏢 Processing ${allCompanies.length} companies...`);
  console.log();

  // Process each company sequentially
  for (let i = 0; i < allCompanies.length; i++) {
    const company = allCompanies[i];
    console.log(
      `\n📈 [${i + 1}/${allCompanies.length}] Processing: ${company!.name}`
    );
    console.log("-".repeat(40));

    await processCompany(company);

    // Small delay between companies to avoid overwhelming the system
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
  console.log(`📋 Check analysis_log table for detailed logs`);
  console.log(`🔍 Use 'bun run studio' to explore the data`);
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Received SIGINT, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Received SIGTERM, shutting down gracefully...");
  process.exit(0);
});

// Run if called directly
if (import.meta.main) {
  main().catch((error) => {
    console.error("💥 Fatal error:", error);
    process.exit(1);
  });
}
