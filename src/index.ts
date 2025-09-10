import { db, importCSV } from "./db/db";
import {
  companies,
  fundingRounds,
  repositoryInfo,
  codeSnapshots,
  developmentVelocity,
} from "./db/schema";
import { eq } from "drizzle-orm";
import { GitHandler } from "./git";
import { QltyAnalyzer } from "./qlty";
import { startDashboardServer } from "./server";
import { calculateEntrepreneurshipAnalysis } from "./analytics";
import fs from "fs";

function displayMenu() {
  console.log("\n🚀 Technical Debt & Funding Analysis");
  console.log("Master's Thesis: Technical debt patterns in venture portfolios");
  console.log("=".repeat(85));
  console.log("1. 📊 Run Complete Analysis");
  console.log("2. 📈 View Dashboard");
  console.log("3. 🔍 Quick Preview");
  console.log("4. 🗑️ Clean repos");
  console.log("5. ❌ Exit");
}

async function getUserChoice(): Promise<string> {
  console.log("\nChoice: ");
  for await (const line of console) {
    return line.trim();
  }
  return "5";
}

// Analyze at funding date (when decision was made) and 3 months before
function getAnalysisDates(fundingDate: string): {
  atFunding: string;
  beforeFunding: string;
} {
  const fundingDateObj = new Date(fundingDate);
  const beforeDateObj = new Date(fundingDate);
  beforeDateObj.setMonth(beforeDateObj.getMonth() - 3);

  return {
    atFunding: fundingDateObj.toISOString().split("T")[0],
    beforeFunding: beforeDateObj.toISOString().split("T")[0],
  };
}

async function processVenture(company: any) {
  const gitHandler = new GitHandler(company.name, false);

  try {
    console.log(`  → Cloning ${company.githubLink}...`);
    const repoPath = await gitHandler.cloneRepo(company.githubLink);

    const rounds = await db
      .select()
      .from(fundingRounds)
      .where(eq(fundingRounds.companyId, company.id));

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

    analysisPoints.sort(
      (a, b) =>
        new Date(a.roundDate).getTime() - new Date(b.roundDate).getTime()
    );

    console.log(`  → ${analysisPoints.length} funding events to analyze`);
    const snapshots: any[] = [];

    for (const [index, round] of analysisPoints.entries()) {
      // Use funding date for analysis (represents state at funding decision)
      const analysisDate = round.roundDate;
      console.log(`  → Analyzing ${round.roundType} at ${analysisDate}`);

      const commitHash = await gitHandler.checkoutDate(analysisDate);
      if (!commitHash) {
        console.log(
          `  ⚠️ No commits found before ${analysisDate}, skipping ${round.roundType}`
        );
        continue;
      }

      const repoInfo = await gitHandler.analyzeRepository();

      // Skip if repository is too small
      if (repoInfo.totalFiles < 10) {
        console.log(
          `  ⚠️ Repository too small at ${analysisDate} (${repoInfo.totalFiles} files), skipping`
        );
        continue;
      }

      const [repositoryInfoRecord] = await db
        .insert(repositoryInfo)
        .values({
          companyId: company.id,
          analysisDate: analysisDate,
          totalFiles: repoInfo.totalFiles,
          repoSizeMB: repoInfo.repoSizeMB,
          commitCount: repoInfo.commitCount,
          firstCommitDate: repoInfo.firstCommitDate,
          lastCommitDate: repoInfo.lastCommitDate,
        })
        .returning();

      const qltyAnalyzer = new QltyAnalyzer(
        repoPath,
        "./data/analysis_results",
        company.name,
        analysisDate,
        round.roundType
      );

      console.log(
        `  → Running code quality analysis for ${round.roundType}...`
      );
      const qltyMetrics = await qltyAnalyzer.runAnalysis();

      // Skip if no meaningful code
      if (qltyMetrics.linesOfCode < 100) {
        console.log(
          `  ⚠️ Insufficient code at ${analysisDate} (${qltyMetrics.linesOfCode} LOC), skipping`
        );
        continue;
      }

      const [snapshotRecord] = await db
        .insert(codeSnapshots)
        .values({
          companyId: company.id,
          fundingRoundId: round.id > 0 ? round.id : null,
          repositoryInfoId: repositoryInfoRecord!.id,
          snapshotDate: analysisDate,
          commitHash,
          linesOfCode: qltyMetrics.linesOfCode,
          totalLines: qltyMetrics.totalLines,
          complexity: qltyMetrics.complexity,
          cognitiveComplexity: qltyMetrics.cognitiveComplexity,
          totalFunctions: qltyMetrics.totalFunctions,
          totalClasses: qltyMetrics.totalClasses,
          totalFields: qltyMetrics.totalFields,
          lackOfCohesion: qltyMetrics.lackOfCohesion,
          totalIssues: qltyMetrics.totalIssues,
          totalEffortMinutes: qltyMetrics.totalEffortMinutes,
          averageEffortPerIssue: qltyMetrics.averageEffortPerIssue,
          issuesByCategory: qltyMetrics.issuesByCategory,
          issuesByLevel: qltyMetrics.issuesByLevel,
          issuesByLanguage: qltyMetrics.issuesByLanguage,
          highComplexityFunctions: qltyMetrics.highComplexityFunctions,
          highComplexityFiles: qltyMetrics.highComplexityFiles,
          manyParameterFunctions: qltyMetrics.manyParameterFunctions,
          complexBooleanLogic: qltyMetrics.complexBooleanLogic,
          deeplyNestedCode: qltyMetrics.deeplyNestedCode,
          manyReturnStatements: qltyMetrics.manyReturnStatements,
          totalCodeSmells: qltyMetrics.totalCodeSmells,
          averageComplexity: qltyMetrics.averageComplexity,
          maxComplexity: qltyMetrics.maxComplexity,
          complexityDensity: qltyMetrics.complexityDensity,
          issuesDensity: qltyMetrics.issuesDensity,
          technicalDebtMinutes: qltyMetrics.technicalDebtMinutes,
          technicalDebtRatio: qltyMetrics.technicalDebtRatio,
          analysisSuccess: qltyMetrics.analysisSuccess,
          analysisErrors: qltyMetrics.analysisErrors,
          qltyVersion: qltyMetrics.qltyVersion,
        })
        .returning();

      snapshots.push({
        ...snapshotRecord,
        roundInfo: round,
      });
    }

    // Calculate development velocity between consecutive funding rounds
    for (let i = 1; i < snapshots.length; i++) {
      const fromSnapshot = snapshots[i - 1];
      const toSnapshot = snapshots[i];
      const fromRound = fromSnapshot.roundInfo;
      const toRound = toSnapshot.roundInfo;

      // Skip if either snapshot has insufficient code
      if (fromSnapshot.linesOfCode < 1000 || toSnapshot.linesOfCode < 1000) {
        console.log(
          `  ⚠️ Insufficient code for velocity calculation, skipping ${fromRound.roundType} to ${toRound.roundType}`
        );
        continue;
      }

      console.log(
        `  → Calculating development velocity from ${fromRound.roundType} to ${toRound.roundType}...`
      );

      const velocityMetrics = await gitHandler.calculateDevelopmentVelocity(
        fromSnapshot.snapshotDate,
        toSnapshot.snapshotDate
      );

      const startTDR = fromSnapshot.technicalDebtRatio || 0;
      const endTDR = toSnapshot.technicalDebtRatio || 0;

      // Calculate TDR change only if both values are valid
      let tdrChange = 0;
      if (startTDR > 0 && startTDR <= 1 && endTDR > 0 && endTDR <= 1) {
        tdrChange = (endTDR - startTDR) / startTDR;
      }

      const safeCompositeVelocity = Math.max(
        0.1,
        velocityMetrics.compositeVelocity
      );
      const safeDevelopmentSpeed = Math.max(
        0.1,
        velocityMetrics.linesChanged / velocityMetrics.periodDays
      );

      // Only calculate TDV if we have valid TDR change
      const tdvSimple =
        Math.abs(tdrChange) > 0
          ? Math.abs(tdrChange) / safeDevelopmentSpeed
          : 0;
      const tdvComposite =
        Math.abs(tdrChange) > 0
          ? Math.abs(tdrChange) / safeCompositeVelocity
          : 0;

      // Check if venture secured next funding round
      const futureRounds = analysisPoints.filter(
        (r) => new Date(r.roundDate) > new Date(toRound.roundDate) && r.id > 0
      );
      const gotNextRound = futureRounds.length > 0;

      await db.insert(developmentVelocity).values({
        companyId: company.id,
        fromRoundId: fromRound.id > 0 ? fromRound.id : null,
        toRoundId: toRound.id > 0 ? toRound.id : null,
        periodDays: velocityMetrics.periodDays,
        commitCount: velocityMetrics.commitCount,
        authorCount: velocityMetrics.authorCount,
        linesAdded: velocityMetrics.linesAdded,
        linesDeleted: velocityMetrics.linesDeleted,
        linesChanged: velocityMetrics.linesChanged,
        commitVelocity: velocityMetrics.commitVelocity,
        authorActivity: velocityMetrics.authorActivity,
        codeChurn: velocityMetrics.codeChurn,
        compositeVelocity: velocityMetrics.compositeVelocity,
        developmentSpeed: safeDevelopmentSpeed,
        startTDR,
        endTDR,
        tdrChange,
        tdvSimple,
        tdvComposite,
        gotNextRound,
      });
    }

    console.log(
      `  ✅ ${company.name} - ${snapshots.length} snapshots, ${
        snapshots.length - 1
      } velocity periods`
    );
  } catch (error) {
    console.error(`  ❌ ${company.name}: ${(error as Error).message}`);
  } finally {
    gitHandler.cleanup();
  }
}

async function runCompleteAnalysis() {
  console.log("🚀 Starting Technical Debt Analysis with Improved Data Quality");
  console.log("📋 Research: Technical debt patterns in venture portfolios");

  // Import venture data
  const csvPath = "./data/startup_seed_data.csv";
  if (fs.existsSync(csvPath)) {
    console.log("📊 Importing venture portfolio data...");
    await importCSV(csvPath);
  } else {
    console.log("❌ CSV not found: ./data/startup_seed_data.csv");
    return;
  }

  const allVentures = await db.select().from(companies);
  if (allVentures.length === 0) {
    console.log("❌ No ventures found in database");
    return;
  }

  console.log(`🏢 Processing ${allVentures.length} technology ventures...`);
  console.log("📝 Note: Analyzing code state at each funding round");

  for (let i = 0; i < allVentures.length; i++) {
    const venture = allVentures[i];
    console.log(`\n[${i + 1}/${allVentures.length}] ${venture!.name}`);
    await processVenture(venture);
  }

  // Generate analysis
  console.log("\n📈 Running Statistical Analysis...");
  const analytics = await calculateEntrepreneurshipAnalysis();

  console.log("\n🎯 TECHNICAL DEBT ANALYSIS RESULTS");
  console.log("=".repeat(60));
  console.log(`📊 Data Quality:`);
  console.log(`   Total records: ${analytics.dataQuality.totalRecords}`);
  console.log(
    `   Valid TDR (0-1): ${analytics.dataQuality.recordsWithValidTDR}`
  );
  console.log(
    `   Sufficient code (>5K LOC): ${analytics.dataQuality.recordsWithSufficientCode}`
  );
  console.log(
    `   Used in analysis: ${analytics.dataQuality.recordsUsedInAnalysis}`
  );

  console.log(`\n📈 Statistical Results:`);
  console.log(
    `   TDR ↔ Velocity: r = ${analytics.statisticalAnalysis.correlation_TDR_velocity.toFixed(
      3
    )}`
  );
  console.log(
    `   Significance: ${analytics.statisticalAnalysis.significanceLevel}`
  );
  console.log(`   R² = ${analytics.statisticalAnalysis.rSquared.toFixed(3)}`);
  console.log(
    `   p-value = ${analytics.statisticalAnalysis.pValue.toFixed(3)}`
  );

  console.log(`\n📊 Strategic Framework:`);
  const framework = analytics.strategicFramework;
  console.log(
    `   Low Debt, High Velocity: ${
      framework.lowDebtHighVelocity.count
    } ventures, ${framework.lowDebtHighVelocity.avgFundingGrowth.toFixed(
      1
    )}% growth`
  );
  console.log(
    `   High Debt, High Velocity: ${
      framework.highDebtHighVelocity.count
    } ventures, ${framework.highDebtHighVelocity.avgFundingGrowth.toFixed(
      1
    )}% growth`
  );
  console.log(
    `   Low Debt, Low Velocity: ${
      framework.lowDebtLowVelocity.count
    } ventures, ${framework.lowDebtLowVelocity.avgFundingGrowth.toFixed(
      1
    )}% growth`
  );
  console.log(
    `   High Debt, Low Velocity: ${
      framework.highDebtLowVelocity.count
    } ventures, ${framework.highDebtLowVelocity.avgFundingGrowth.toFixed(
      1
    )}% growth`
  );

  console.log(`\n💡 Key Finding:`);
  console.log(`   ${analytics.insights.primaryFinding}`);

  console.log(`\n⚠️ Data Quality Note:`);
  console.log(`   ${analytics.insights.dataQualityNote}`);

  console.log(
    "\n🌐 Launch dashboard (option 2) to see detailed visual results"
  );
}

async function showQuickAnalytics() {
  console.log("📊 Quick Preview of Analysis Results");

  try {
    const analytics = await calculateEntrepreneurshipAnalysis();

    console.log(`\n📈 Dataset Summary:`);
    console.log(`   Ventures analyzed: ${analytics.summary.totalVentures}`);
    console.log(`   Valid data points: ${analytics.summary.validDataPoints}`);
    console.log(`   Filtered out: ${analytics.summary.filteredDataPoints}`);
    console.log(
      `   Median funding growth: ${analytics.summary.avgFundingGrowthRate.toFixed(
        1
      )}%`
    );
    console.log(
      `   Median TDR: ${analytics.summary.avgTechnicalDebtRatio.toFixed(3)}`
    );
    console.log(
      `   Median velocity: ${analytics.summary.avgDevelopmentVelocity.toFixed(
        1
      )}`
    );

    console.log(`\n🔬 Statistical Analysis:`);
    console.log(
      `   TDR-Velocity correlation: ${analytics.statisticalAnalysis.correlation_TDR_velocity.toFixed(
        3
      )}`
    );
    console.log(
      `   Significance: ${analytics.statisticalAnalysis.significanceLevel}`
    );
    console.log(
      `   R-squared: ${analytics.statisticalAnalysis.rSquared.toFixed(3)}`
    );

    console.log(`\n💡 Finding: ${analytics.insights.primaryFinding}`);
  } catch (error) {
    console.log("⚠️ No analysis results available yet.");
    console.log("Run complete analysis first (option 1).");
  }
}

async function main() {
  while (true) {
    displayMenu();
    const choice = await getUserChoice();

    switch (choice) {
      case "1":
        await runCompleteAnalysis();
        break;
      case "2":
        console.log("🌐 Starting dashboard server...");
        await startDashboardServer();
        break;
      case "3":
        await showQuickAnalytics();
        break;
      case "4":
        console.log("🗑️ Cleaning repository cache...");
        GitHandler.cleanAllRepos();
        console.log("✅ All cloned repositories cleaned");
        break;
      case "5":
        console.log("👋 Good luck with your thesis!");
        process.exit(0);
        break;
      default:
        console.log("❌ Invalid choice. Please select 1-5.");
    }

    if (choice !== "2") {
      console.log("\nPress Enter to continue...");
      await getUserChoice();
    }
  }
}

if (import.meta.main) {
  main().catch(console.error);
}
