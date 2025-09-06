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
import { SonarAnalyzer } from "./sonar";
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

      // Run SonarQube analysis
      const projectKey = `${company.name.replace(/[^a-zA-Z0-9]/g, "_")}_${
        round.roundType
      }_${round.roundDate.replace(/-/g, "")}`;
      const sonarAnalyzer = new SonarAnalyzer(repoPath);
      const sonarMetrics = await sonarAnalyzer.runAnalysis(projectKey);

      // Insert code snapshot
      await db.insert(codeSnapshots).values({
        companyId: company.id,
        fundingRoundId: round.id > 0 ? round.id : null,
        repositoryInfoId: repositoryInfoRecord!.id,
        snapshotDate: round.roundDate,
        commitHash,
        ncloc: sonarMetrics.ncloc,
        sqaleIndex: sonarMetrics.sqaleIndex,
        sqaleRating: sonarMetrics.sqaleRating,
        sqaleDebtRatio: sonarMetrics.sqaleDebtRatio,
        codeSmells: sonarMetrics.codeSmells,
        bugs: sonarMetrics.bugs,
        vulnerabilities: sonarMetrics.vulnerabilities,
        securityHotspots: sonarMetrics.securityHotspots,
        duplicatedLinesDensity: sonarMetrics.duplicatedLinesDensity,
        complexity: sonarMetrics.complexity,
        cognitiveComplexity: sonarMetrics.cognitiveComplexity,
        coverage: sonarMetrics.coverage,
        lineCoverage: sonarMetrics.lineCoverage,
        reliabilityRating: sonarMetrics.reliabilityRating,
        securityRating: sonarMetrics.securityRating,
        maintainabilityRating: sonarMetrics.maintainabilityRating,
        alertStatus: sonarMetrics.alertStatus,
        tdDensity: sonarMetrics.tdDensity,
        qualityScore: sonarMetrics.qualityScore,
        sonarProjectKey: sonarMetrics.sonarProjectKey,
        analysisSuccess: sonarMetrics.analysisSuccess,
        analysisErrors: sonarMetrics.analysisErrors,
      });

      await log(
        company.id,
        "info",
        "analysis",
        `Completed analysis for ${round.roundType}`,
        {
          commit: commitHash,
          ncloc: sonarMetrics.ncloc,
          tdDensity: sonarMetrics.tdDensity,
          qualityScore: sonarMetrics.qualityScore,
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
  console.log("🚀 Starting Startup Technical Debt Analysis");
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
    console.log("Usage: bun run index.ts <csv-file>");
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

    // Small delay between companies to be respectful to SonarQube
    if (i < allCompanies.length - 1) {
      console.log("⏳ Waiting 5 seconds before next company...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
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

  console.log(`\n💾 Data saved to: analysis.db`);
  console.log(`📋 Check analysis_log table for detailed logs`);
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
