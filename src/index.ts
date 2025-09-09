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
import { calculateFundingOutcomeAnalysis } from "./analytics";
import fs from "fs";

function displayMenu() {
  console.log("\n🚀 Technical Debt & Startup Funding Analysis");
  console.log(
    "Research: How development speed moderates technical debt impact on funding outcomes"
  );
  console.log("=".repeat(75));
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

// FIXED: Add proper temporal lag for due diligence timing
function getAnalysisDate(fundingDate: string): string {
  const date = new Date(fundingDate);
  date.setMonth(date.getMonth() - 3); // 3 months before funding announcement
  return date.toISOString().split("T")[0];
}

async function processCompany(company: any) {
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

    console.log(`  → ${analysisPoints.length} events to analyze`);
    const snapshots: any[] = [];

    for (const [index, round] of analysisPoints.entries()) {
      // FIXED: Use proper temporal lag (3 months before funding)
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

      console.log(`  → Running Qlty analysis for ${round.roundType}...`);
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

    // Calculate development velocity between consecutive analysis points
    for (let i = 1; i < snapshots.length; i++) {
      const fromSnapshot = snapshots[i - 1];
      const toSnapshot = snapshots[i];
      const fromRound = fromSnapshot.roundInfo;
      const toRound = toSnapshot.roundInfo;

      console.log(
        `  → Calculating velocity from ${fromRound.roundType} to ${toRound.roundType}...`
      );

      // Calculate velocity between the analysis dates (not funding dates)
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

      // Check if company got next funding round after the "to" round
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
  console.log("🚀 Starting Academic Analysis with Proper Temporal Controls");

  // Import CSV
  const csvPath = "./data/startup_seed_data.csv";
  if (fs.existsSync(csvPath)) {
    console.log("📊 Importing CSV data...");
    await importCSV(csvPath);
  } else {
    console.log("❌ CSV not found: ./data/startup_seed_data.csv");
    return;
  }

  const allCompanies = await db.select().from(companies);
  if (allCompanies.length === 0) {
    console.log("❌ No companies found in database");
    return;
  }

  console.log(
    `🏢 Processing ${allCompanies.length} startups with 3-month temporal lag...`
  );
  console.log(
    "📝 Note: Analyzing code state 3 months before each funding date"
  );

  for (let i = 0; i < allCompanies.length; i++) {
    const company = allCompanies[i];
    console.log(`\n[${i + 1}/${allCompanies.length}] ${company!.name}`);
    await processCompany(company);
  }

  // Generate final analytics with proper regression
  console.log("\n📈 Running Statistical Analysis...");
  const analytics = await calculateFundingOutcomeAnalysis();

  console.log("\n🎯 ACADEMIC RESULTS");
  console.log("=".repeat(60));
  console.log(
    `📊 Sample: ${analytics.summary.totalCompanies} companies, ${analytics.summary.totalFundingPeriods} funding periods`
  );
  console.log(
    `💰 Average funding growth: ${analytics.summary.avgFundingGrowthRate.toFixed(
      1
    )}%`
  );
  console.log(
    `📈 Success rate: ${analytics.summary.fundingSuccessRate.toFixed(1)}%`
  );
  console.log(`📉 R-squared: ${analytics.hypothesisTest.rSquared.toFixed(3)}`);

  if (analytics.hypothesisTest.hypothesisSupported) {
    console.log(`\n✅ HYPOTHESIS SUPPORTED`);
    console.log(
      `🔬 Interaction coefficient: β₃ = ${analytics.hypothesisTest.interactionEffect.toFixed(
        3
      )}`
    );
    console.log(
      `📊 Statistical significance: p = ${analytics.hypothesisTest.interactionPValue.toFixed(
        3
      )}`
    );
    console.log(`💡 ${analytics.keyFindings.theoreticalImplication}`);
  } else {
    console.log(`\n❌ HYPOTHESIS NOT SUPPORTED`);
    console.log(
      `🔬 Interaction coefficient: β₃ = ${analytics.hypothesisTest.interactionEffect.toFixed(
        3
      )}`
    );
    console.log(
      `📊 Statistical significance: p = ${analytics.hypothesisTest.interactionPValue.toFixed(
        3
      )}`
    );
    console.log(`💡 ${analytics.keyFindings.theoreticalImplication}`);
  }

  console.log(`\n🎓 Academic Contribution:`);
  console.log(`${analytics.keyFindings.academicContribution}`);

  console.log(`\n⚠️  Limitations:`);
  console.log(`${analytics.keyFindings.limitations}`);

  console.log(`\n🔄 Robustness Checks:`);
  console.log(
    `   Log transform: β₃ = ${analytics.hypothesisTest.robustness.logTransform.interaction.toFixed(
      3
    )} (p = ${analytics.hypothesisTest.robustness.logTransform.pValue.toFixed(
      3
    )})`
  );
  console.log(
    `   Winsorized: β₃ = ${analytics.hypothesisTest.robustness.winsorized.interaction.toFixed(
      3
    )} (p = ${analytics.hypothesisTest.robustness.winsorized.pValue.toFixed(
      3
    )})`
  );
  console.log(
    `   Outliers excluded: β₃ = ${analytics.hypothesisTest.robustness.excludeOutliers.interaction.toFixed(
      3
    )} (p = ${analytics.hypothesisTest.robustness.excludeOutliers.pValue.toFixed(
      3
    )})`
  );

  console.log("\n🌐 Launch dashboard (option 2) to see detailed results");
}

async function showQuickAnalytics() {
  console.log("📊 Quick Preview of Current Results");

  try {
    const analytics = await calculateFundingOutcomeAnalysis();

    console.log(`\n📈 Dataset Summary:`);
    console.log(`   Companies analyzed: ${analytics.summary.totalCompanies}`);
    console.log(`   Funding periods: ${analytics.summary.totalFundingPeriods}`);
    console.log(
      `   Average funding growth: ${analytics.summary.avgFundingGrowthRate.toFixed(
        1
      )}%`
    );
    console.log(
      `   Overall success rate: ${analytics.summary.fundingSuccessRate.toFixed(
        1
      )}%`
    );

    console.log(`\n🔬 Statistical Results:`);
    console.log(
      `   R-squared: ${analytics.hypothesisTest.rSquared.toFixed(3)}`
    );
    console.log(
      `   Main TDR effect (β₁): ${analytics.hypothesisTest.mainEffect_TDR.toFixed(
        3
      )}`
    );
    console.log(
      `   Main velocity effect (β₂): ${analytics.hypothesisTest.mainEffect_Velocity.toFixed(
        3
      )}`
    );
    console.log(
      `   Interaction effect (β₃): ${analytics.hypothesisTest.interactionEffect.toFixed(
        3
      )}`
    );
    console.log(
      `   P-value: ${analytics.hypothesisTest.interactionPValue.toFixed(3)}`
    );

    const result = analytics.hypothesisTest.hypothesisSupported
      ? "✅ SUPPORTED"
      : "❌ NOT SUPPORTED";
    console.log(`   Hypothesis: ${result}`);

    console.log(`\n📊 Strategic Matrix Performance:`);
    console.log(
      `   Speed Strategy: ${analytics.strategicMatrix.speedStrategy.avgFundingGrowth.toFixed(
        1
      )}% growth (${analytics.strategicMatrix.speedStrategy.count} companies)`
    );
    console.log(
      `   Technical Chaos: ${analytics.strategicMatrix.technicalChaos.avgFundingGrowth.toFixed(
        1
      )}% growth (${analytics.strategicMatrix.technicalChaos.count} companies)`
    );
    console.log(
      `   Engineering Excellence: ${analytics.strategicMatrix.engineeringExcellence.avgFundingGrowth.toFixed(
        1
      )}% growth (${
        analytics.strategicMatrix.engineeringExcellence.count
      } companies)`
    );
    console.log(
      `   Over-Engineering: ${analytics.strategicMatrix.overEngineering.avgFundingGrowth.toFixed(
        1
      )}% growth (${analytics.strategicMatrix.overEngineering.count} companies)`
    );

    console.log(`\n💡 Key Insight:`);
    console.log(`${analytics.keyFindings.primaryInsight}`);
  } catch (error) {
    console.log("⚠️  No analysis results available yet.");
    console.log(
      "Run complete analysis first (option 1) to generate statistical results."
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
        console.log("👋 Good luck with your master's thesis!");
        console.log(
          "🎓 Remember to clearly state your limitations and contributions in your write-up."
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
