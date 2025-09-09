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
import { calculateTDVAnalytics } from "./analytics";
import fs from "fs";

function displayMenu() {
  console.log("\n🚀 Technical Debt Velocity (TDV) Analysis");
  console.log(
    "Thesis: Development speed moderates technical debt impact on funding"
  );
  console.log("=".repeat(60));
  console.log("1. 📊 Run TDV Analysis");
  console.log("2. 🌐 View TDV Dashboard");
  console.log("3. 🗑️ Clean repos");
  console.log("4. ❌ Exit");
}

async function getUserChoice(): Promise<string> {
  console.log("\nChoice: ");
  for await (const line of console) {
    return line.trim();
  }
  return "4";
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

    const snapshots: any[] = [];

    for (const round of analysisPoints) {
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

    // Calculate TDV between consecutive rounds
    for (let i = 1; i < snapshots.length; i++) {
      const fromSnapshot = snapshots[i - 1];
      const toSnapshot = snapshots[i];

      const fromRound = fromSnapshot.roundInfo;
      const toRound = toSnapshot.roundInfo;

      const devMetrics = await gitHandler.calculateDevelopmentSpeed(
        fromRound.roundDate,
        toRound.roundDate
      );

      const startTDR = fromSnapshot.technicalDebtRatio || 0;
      const endTDR = toSnapshot.technicalDebtRatio || 0;
      const tdrChange = startTDR > 0 ? (endTDR - startTDR) / startTDR : 0;

      const tdv =
        devMetrics.developmentSpeed > 0
          ? tdrChange / devMetrics.developmentSpeed
          : 0;

      // Check if company got next round
      const futureRounds = analysisPoints.filter(
        (r) => new Date(r.roundDate) > new Date(toRound.roundDate) && r.id > 0
      );
      const gotNextRound = futureRounds.length > 0;

      await db.insert(developmentVelocity).values({
        companyId: company.id,
        fromRoundId: fromRound.id > 0 ? fromRound.id : null,
        toRoundId: toRound.id > 0 ? toRound.id : null,
        periodDays: devMetrics.periodDays,
        linesAdded: devMetrics.linesAdded,
        developmentSpeed: devMetrics.developmentSpeed,
        startTDR,
        endTDR,
        tdrChange,
        tdv,
        gotNextRound,
      });
    }
  } catch (error) {
    console.error(`❌ Failed: ${company.name}`);
  } finally {
    gitHandler.cleanup();
  }
}

async function runTDVAnalysis() {
  console.log("🚀 Starting TDV Analysis");

  const csvPath = process.argv[2] || "./data/startup_seed_data.csv";
  if (csvPath && fs.existsSync(csvPath)) {
    await importCSV(csvPath);
  }

  const allCompanies = await db.select().from(companies);
  if (allCompanies.length === 0) {
    console.log("❌ No companies found. Import CSV data first.");
    return;
  }

  console.log(`Processing ${allCompanies.length} companies...`);

  for (let i = 0; i < allCompanies.length; i++) {
    const company = allCompanies[i];
    console.log(`[${i + 1}/${allCompanies.length}] ${company!.name}`);
    await processCompany(company);
  }

  console.log("✅ TDV Analysis Complete!");
}

async function main() {
  while (true) {
    displayMenu();
    const choice = await getUserChoice();

    switch (choice) {
      case "1":
        await runTDVAnalysis();
        break;
      case "2":
        await startDashboardServer();
        break;
      case "3":
        GitHandler.cleanAllRepos();
        console.log("✅ Repos cleaned");
        break;
      case "4":
        console.log("👋 Goodbye!");
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
