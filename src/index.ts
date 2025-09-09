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
  console.log("\n🚀 Technical Debt & Entrepreneurial Execution Analysis");
  console.log(
    "Master's Thesis: Resource constraints and organizational agility in technology ventures"
  );
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

// FIXED: Add proper temporal lag for investment due diligence timing
function getAnalysisDate(fundingDate: string): string {
  const date = new Date(fundingDate);
  date.setMonth(date.getMonth() - 3); // 3 months before funding announcement
  return date.toISOString().split("T")[0];
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
      // FIXED: Use proper temporal lag (3 months before funding for due diligence)
      const analysisDate = getAnalysisDate(round.roundDate);
      console.log(
        `  → Analyzing ${round.roundType} at ${analysisDate} (3mo before ${round.roundDate})`
      );

      const commitHash = await gitHandler.checkoutDate(analysisDate);
      if (!commitHash) {
        console.log(
          `  ⚠️ No commits found before ${analysisDate}, skipping ${round.roundType}`
        );
        continue;
      }

      const repoInfo = await gitHandler.analyzeRepository();
      const [repositoryInfoRecord] = await db
        .insert(repositoryInfo)
        .values({
          companyId: company.id,
          analysisDate: analysisDate, // Use analysis date, not funding date
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
        analysisDate, // Use analysis date for file naming
        round.roundType
      );

      console.log(
        `  → Running code quality analysis for ${round.roundType}...`
      );
      const qltyMetrics = await qltyAnalyzer.runAnalysis();

      const [snapshotRecord] = await db
        .insert(codeSnapshots)
        .values({
          companyId: company.id,
          fundingRoundId: round.id > 0 ? round.id : null,
          repositoryInfoId: repositoryInfoRecord!.id,
          snapshotDate: analysisDate, // Store analysis date
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

    // Calculate organizational agility between consecutive analysis points
    for (let i = 1; i < snapshots.length; i++) {
      const fromSnapshot = snapshots[i - 1];
      const toSnapshot = snapshots[i];
      const fromRound = fromSnapshot.roundInfo;
      const toRound = toSnapshot.roundInfo;

      console.log(
        `  → Calculating organizational agility from ${fromRound.roundType} to ${toRound.roundType}...`
      );

      // Calculate development velocity between the analysis dates (not funding dates)
      const velocityMetrics = await gitHandler.calculateDevelopmentVelocity(
        fromSnapshot.snapshotDate, // Use analysis dates
        toSnapshot.snapshotDate
      );

      const startTDR = fromSnapshot.technicalDebtRatio || 0;
      const endTDR = toSnapshot.technicalDebtRatio || 0;
      const tdrChange = startTDR > 0 ? (endTDR - startTDR) / startTDR : 0;

      const safeCompositeVelocity = Math.max(
        0.1,
        velocityMetrics.compositeVelocity
      );
      const safeDevelopmentSpeed = Math.max(
        0.1,
        velocityMetrics.linesChanged / velocityMetrics.periodDays
      );

      const tdvSimple = Math.abs(tdrChange) / safeDevelopmentSpeed;
      const tdvComposite = Math.abs(tdrChange) / safeCompositeVelocity;

      // Check if venture secured next funding round after the "to" round
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
      } execution periods`
    );
  } catch (error) {
    console.error(`  ❌ ${company.name}: ${(error as Error).message}`);
  } finally {
    gitHandler.cleanup();
  }
}

async function runCompleteAnalysis() {
  console.log(
    "🚀 Starting Entrepreneurship Analysis with Proper Temporal Controls"
  );
  console.log(
    "📋 Research: Technical debt associations with organizational agility"
  );

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

  console.log(
    `🏢 Processing ${allVentures.length} technology ventures with 3-month temporal lag...`
  );
  console.log(
    "📝 Note: Analyzing code state 3 months before each funding date (due diligence period)"
  );

  for (let i = 0; i < allVentures.length; i++) {
    const venture = allVentures[i];
    console.log(`\n[${i + 1}/${allVentures.length}] ${venture!.name}`);
    await processVenture(venture);
  }

  // Generate entrepreneurship analytics
  console.log("\n📈 Running Entrepreneurship Statistical Analysis...");
  const analytics = await calculateEntrepreneurshipAnalysis();

  console.log("\n🎯 ENTREPRENEURSHIP RESEARCH RESULTS");
  console.log("=".repeat(60));
  console.log(
    `📊 Sample: ${analytics.summary.totalVentures} ventures, ${analytics.summary.totalExecutionPeriods} execution periods`
  );
  console.log(
    `💰 Average funding growth: ${analytics.summary.avgFundingGrowthRate.toFixed(
      1
    )}%`
  );
  console.log(
    `📈 Next round success rate: ${analytics.summary.executionSuccessRate.toFixed(
      1
    )}%`
  );
  console.log(
    `📉 Model R-squared: ${analytics.empiricalFindings.rSquared.toFixed(3)}`
  );

  if (analytics.empiricalFindings.associationSupported) {
    console.log(`\n✅ ASSOCIATION DETECTED`);
    console.log(
      `🔬 Primary correlation: r = ${analytics.empiricalFindings.primaryAssociation.toFixed(
        3
      )}`
    );
    console.log(
      `📊 Association strength: ${analytics.empiricalFindings.significanceLevel}`
    );
    console.log(
      `📈 Sample size: n = ${analytics.empiricalFindings.sampleSize}`
    );
    console.log(
      `💡 ${analytics.entrepreneurshipInsights.practicalImplication}`
    );
  } else {
    console.log(`\n❌ NO SIGNIFICANT ASSOCIATION`);
    console.log(
      `🔬 Primary correlation: r = ${analytics.empiricalFindings.primaryAssociation.toFixed(
        3
      )}`
    );
    console.log(
      `📊 Association strength: ${analytics.empiricalFindings.significanceLevel}`
    );
    console.log(
      `📈 Sample size: n = ${analytics.empiricalFindings.sampleSize}`
    );
    console.log(
      `💡 ${analytics.entrepreneurshipInsights.practicalImplication}`
    );
  }

  console.log(`\n🎓 Research Contribution:`);
  console.log(`${analytics.entrepreneurshipInsights.researchContribution}`);

  console.log(`\n⚠️  Study Limitations:`);
  console.log(`${analytics.entrepreneurshipInsights.studyLimitations}`);

  console.log(`\n🔄 Correlation Matrix:`);
  console.log(
    `   Technical Debt ↔ Organizational Agility: r = ${analytics.correlationMatrix.debtAgility.toFixed(
      3
    )}`
  );
  console.log(
    `   Technical Debt ↔ Funding Growth: r = ${analytics.correlationMatrix.debtFunding.toFixed(
      3
    )}`
  );
  console.log(
    `   Organizational Agility ↔ Funding: r = ${analytics.correlationMatrix.agilityFunding.toFixed(
      3
    )}`
  );
  console.log(
    `   Technical Debt ↔ Team Size: r = ${analytics.correlationMatrix.debtTeamSize.toFixed(
      3
    )}`
  );

  console.log(`\n📊 Strategic Framework Performance:`);
  console.log(
    `   Speed-to-Market Strategy: ${analytics.strategicFramework.speedToMarket.avgFundingGrowth.toFixed(
      1
    )}% growth (${analytics.strategicFramework.speedToMarket.count} ventures)`
  );
  console.log(
    `   Technical Debt Trap: ${analytics.strategicFramework.technicalDebtTrap.avgFundingGrowth.toFixed(
      1
    )}% growth (${
      analytics.strategicFramework.technicalDebtTrap.count
    } ventures)`
  );
  console.log(
    `   Sustainable Execution: ${analytics.strategicFramework.sustainableExecution.avgFundingGrowth.toFixed(
      1
    )}% growth (${
      analytics.strategicFramework.sustainableExecution.count
    } ventures)`
  );
  console.log(
    `   Premature Optimization: ${analytics.strategicFramework.prematureOptimization.avgFundingGrowth.toFixed(
      1
    )}% growth (${
      analytics.strategicFramework.prematureOptimization.count
    } ventures)`
  );

  console.log(
    "\n🌐 Launch dashboard (option 2) to see detailed visual results"
  );
}

async function showQuickAnalytics() {
  console.log("📊 Quick Preview of Current Entrepreneurship Results");

  try {
    const analytics = await calculateEntrepreneurshipAnalysis();

    console.log(`\n📈 Dataset Summary:`);
    console.log(
      `   Technology ventures analyzed: ${analytics.summary.totalVentures}`
    );
    console.log(
      `   Execution periods: ${analytics.summary.totalExecutionPeriods}`
    );
    console.log(
      `   Average funding growth: ${analytics.summary.avgFundingGrowthRate.toFixed(
        1
      )}%`
    );
    console.log(
      `   Overall next round success: ${analytics.summary.executionSuccessRate.toFixed(
        1
      )}%`
    );

    console.log(`\n🔬 Empirical Results:`);
    console.log(
      `   Model R-squared: ${analytics.empiricalFindings.rSquared.toFixed(3)}`
    );
    console.log(
      `   Primary association (r): ${analytics.empiricalFindings.primaryAssociation.toFixed(
        3
      )}`
    );
    console.log(
      `   Regression slope (β): ${analytics.empiricalFindings.regressionSlope.toFixed(
        3
      )}`
    );
    console.log(
      `   Sample size: n = ${analytics.empiricalFindings.sampleSize}`
    );
    console.log(
      `   Association strength: ${analytics.empiricalFindings.significanceLevel}`
    );

    const result = analytics.empiricalFindings.associationSupported
      ? "✅ ASSOCIATION DETECTED"
      : "❌ NO SIGNIFICANT ASSOCIATION";
    console.log(`   Research finding: ${result}`);

    console.log(`\n📊 Strategic Framework Performance:`);
    console.log(
      `   Speed-to-Market: ${analytics.strategicFramework.speedToMarket.avgFundingGrowth.toFixed(
        1
      )}% growth (${analytics.strategicFramework.speedToMarket.count} ventures)`
    );
    console.log(
      `   Technical Debt Trap: ${analytics.strategicFramework.technicalDebtTrap.avgFundingGrowth.toFixed(
        1
      )}% growth (${
        analytics.strategicFramework.technicalDebtTrap.count
      } ventures)`
    );
    console.log(
      `   Sustainable Execution: ${analytics.strategicFramework.sustainableExecution.avgFundingGrowth.toFixed(
        1
      )}% growth (${
        analytics.strategicFramework.sustainableExecution.count
      } ventures)`
    );
    console.log(
      `   Premature Optimization: ${analytics.strategicFramework.prematureOptimization.avgFundingGrowth.toFixed(
        1
      )}% growth (${
        analytics.strategicFramework.prematureOptimization.count
      } ventures)`
    );

    console.log(`\n💡 Key Finding:`);
    console.log(`${analytics.entrepreneurshipInsights.primaryFinding}`);

    console.log(`\n🚀 Entrepreneurial Implication:`);
    console.log(`${analytics.entrepreneurshipInsights.practicalImplication}`);
  } catch (error) {
    console.log("⚠️  No analysis results available yet.");
    console.log(
      "Run complete analysis first (option 1) to generate empirical results."
    );
    console.log(`Error: ${(error as Error).message}`);
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
        console.log("🌐 Starting entrepreneurship dashboard server...");
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
        console.log("👋 Good luck with your entrepreneurship master's thesis!");
        console.log(
          "🎓 Remember: This analysis shows associations, not causation. Be transparent about limitations in your write-up."
        );
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
