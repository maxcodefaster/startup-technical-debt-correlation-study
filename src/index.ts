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

async function processCompany(company: any) {
  const gitHandler = new GitHandler(company.name, false);

  try {
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

    console.log(`  → ${analysisPoints.length} events`);
    const snapshots: any[] = [];

    for (const [index, round] of analysisPoints.entries()) {
      const commitHash = await gitHandler.checkoutDate(round.roundDate);
      if (!commitHash) continue;

      const repoInfo = await gitHandler.analyzeRepository();
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

      const qltyAnalyzer = new QltyAnalyzer(
        repoPath,
        "./data/analysis_results",
        company.name,
        round.roundDate,
        round.roundType
      );
      const qltyMetrics = await qltyAnalyzer.runAnalysis();

      const [snapshotRecord] = await db
        .insert(codeSnapshots)
        .values({
          companyId: company.id,
          fundingRoundId: round.id > 0 ? round.id : null,
          repositoryInfoId: repositoryInfoRecord!.id,
          snapshotDate: round.roundDate,
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

    // Development velocity between consecutive rounds
    for (let i = 1; i < snapshots.length; i++) {
      const fromSnapshot = snapshots[i - 1];
      const toSnapshot = snapshots[i];
      const fromRound = fromSnapshot.roundInfo;
      const toRound = toSnapshot.roundInfo;

      const velocityMetrics = await gitHandler.calculateDevelopmentVelocity(
        fromRound.roundDate,
        toRound.roundDate
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
        velocityMetrics.linesAdded / velocityMetrics.periodDays
      );

      const tdvSimple = Math.abs(tdrChange) / safeDevelopmentSpeed;
      const tdvComposite = Math.abs(tdrChange) / safeCompositeVelocity;

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

    console.log(`  ✅ ${company.name}`);
  } catch (error) {
    console.error(`  ❌ ${company.name}: ${(error as Error).message}`);
  } finally {
    gitHandler.cleanup();
  }
}

async function runCompleteAnalysis() {
  console.log("🚀 Starting Analysis");

  // Import CSV
  const csvPath = "./data/startup_seed_data.csv";
  if (fs.existsSync(csvPath)) {
    console.log("📊 Importing CSV...");
    await importCSV(csvPath);
  } else {
    console.log("❌ CSV not found: ./data/startup_seed_data.csv");
    return;
  }

  const allCompanies = await db.select().from(companies);
  if (allCompanies.length === 0) {
    console.log("❌ No companies found");
    return;
  }

  console.log(`🏢 Processing ${allCompanies.length} startups...`);

  for (let i = 0; i < allCompanies.length; i++) {
    const company = allCompanies[i];
    console.log(`[${i + 1}/${allCompanies.length}] ${company!.name}`);
    await processCompany(company);
  }

  // Final analytics
  console.log("📈 Generating results...");
  const analytics = await calculateFundingOutcomeAnalysis();

  console.log("\n🎯 RESULTS");
  console.log("=".repeat(40));
  console.log(`Companies: ${analytics.summary.totalCompanies}`);
  console.log(`Periods: ${analytics.summary.totalFundingPeriods}`);
  console.log(
    `Avg funding growth: ${analytics.summary.avgFundingGrowthRate.toFixed(1)}%`
  );
  console.log(
    `Success rate: ${analytics.summary.fundingSuccessRate.toFixed(1)}%`
  );

  if (analytics.hypothesisTest.hypothesisSupported) {
    console.log(
      `\n🎉 HYPOTHESIS SUPPORTED (β₃=${analytics.hypothesisTest.interactionEffect.toFixed(
        3
      )})`
    );
  } else {
    console.log(
      `\n📋 HYPOTHESIS NOT SUPPORTED (β₃=${analytics.hypothesisTest.interactionEffect.toFixed(
        3
      )})`
    );
  }

  console.log(`\n💡 ${analytics.keyFindings.primaryInsight}`);
  console.log("\n🌐 View full dashboard (option 2)");
}

async function showQuickAnalytics() {
  console.log("📊 Quick Preview");

  try {
    const analytics = await calculateFundingOutcomeAnalysis();

    console.log(`Companies: ${analytics.summary.totalCompanies}`);
    console.log(`Periods: ${analytics.summary.totalFundingPeriods}`);
    console.log(
      `Funding growth: ${analytics.summary.avgFundingGrowthRate.toFixed(1)}%`
    );
    console.log(
      `Success rate: ${analytics.summary.fundingSuccessRate.toFixed(1)}%`
    );

    console.log(
      `\nHypothesis: β₃=${analytics.hypothesisTest.interactionEffect.toFixed(
        3
      )} (${
        analytics.hypothesisTest.hypothesisSupported
          ? "SUPPORTED"
          : "NOT SUPPORTED"
      })`
    );

    console.log(`\nStrategy Performance:`);
    console.log(
      `  Speed Strategy: ${analytics.strategicMatrix.speedStrategy.avgFundingGrowth.toFixed(
        1
      )}% growth`
    );
    console.log(
      `  Tech Chaos: ${analytics.strategicMatrix.technicalChaos.avgFundingGrowth.toFixed(
        1
      )}% growth`
    );
    console.log(
      `  Excellence: ${analytics.strategicMatrix.engineeringExcellence.avgFundingGrowth.toFixed(
        1
      )}% growth`
    );
    console.log(
      `  Over-Engineering: ${analytics.strategicMatrix.overEngineering.avgFundingGrowth.toFixed(
        1
      )}% growth`
    );
  } catch (error) {
    console.log("⚠️  No data yet. Run analysis first (option 1).");
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
        await startDashboardServer();
        break;
      case "3":
        await showQuickAnalytics();
        break;
      case "4":
        GitHandler.cleanAllRepos();
        console.log("✅ Repos cleaned");
        break;
      case "5":
        console.log("👋 Good luck with your thesis!");
        process.exit(0);
        break;
      default:
        console.log("❌ Invalid choice");
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
