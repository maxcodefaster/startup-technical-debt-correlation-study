import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface QltyMetrics {
  // Core metrics from metrics.txt
  linesOfCode: number;
  totalLines: number;
  complexity: number;
  cognitiveComplexity: number;
  totalFunctions: number;
  totalClasses: number;
  totalFields: number;
  lackOfCohesion: number;

  // Aggregated smells data
  totalIssues: number;
  totalEffortMinutes: number;
  averageEffortPerIssue: number;
  issuesByCategory: string; // JSON
  issuesByLevel: string; // JSON
  issuesByLanguage: string; // JSON

  // Legacy fields for backward compatibility
  duplicatedCode: number;
  similarCode: number;
  highComplexityFunctions: number;
  highComplexityFiles: number;
  manyParameterFunctions: number;
  complexBooleanLogic: number;
  deeplyNestedCode: number;
  manyReturnStatements: number;

  // Derived quality metrics
  totalCodeSmells: number;
  duplicatedLinesPercentage: number;
  averageComplexity: number;
  maxComplexity: number;
  complexityDensity: number;
  issuesDensity: number;
  technicalDebtMinutes: number;
  technicalDebtRatio: number;

  // Metadata
  analysisSuccess: boolean;
  analysisErrors: string | null;
  qltyVersion: string;
}

export class QltyAnalyzer {
  private outputDir: string;
  private repoName: string;
  private analysisDate: string;

  constructor(
    private repoPath: string,
    outputBaseDir: string,
    analysisDate: string
  ) {
    this.repoName = path.basename(this.repoPath);
    this.analysisDate = analysisDate;
    this.outputDir = path.join(outputBaseDir, this.repoName, this.analysisDate);
    this.ensureOutputDir();
  }

  async runAnalysis(): Promise<QltyMetrics> {
    try {
      const qltyVersion = await this.ensureQltyInstalled();
      await this.initializeQlty();
      await this.runCodeSmellsToFile();
      await this.runMetricsToFile();

      const smells = await this.parseCodeSmellsFile();
      const metrics = await this.parseMetricsFile();

      // Calculate derived metrics
      const linesOfCode = metrics.linesOfCode || 0;
      const totalIssues = smells.totalIssues || 0;
      const totalEffortMinutes = smells.totalEffortMinutes || 0;
      const complexity = metrics.complexity || 0;

      const complexityDensity =
        linesOfCode > 0 ? (complexity / linesOfCode) * 1000 : 0;
      const issuesDensity =
        linesOfCode > 0 ? (totalIssues / linesOfCode) * 1000 : 0;

      // Estimate technical debt ratio: effort minutes / estimated development time
      // Rough estimate: 1 LOC = 0.5 minutes of development time
      const estimatedDevMinutes = linesOfCode * 0.5;
      const technicalDebtRatio =
        estimatedDevMinutes > 0 ? totalEffortMinutes / estimatedDevMinutes : 0;

      return {
        // Core metrics
        linesOfCode,
        totalLines: metrics.totalLines || 0,
        complexity,
        cognitiveComplexity: metrics.cognitiveComplexity || 0,
        totalFunctions: metrics.totalFunctions || 0,
        totalClasses: metrics.totalClasses || 0,
        totalFields: metrics.totalFields || 0,
        lackOfCohesion: metrics.lackOfCohesion || 0,

        // Smells aggregations
        totalIssues,
        totalEffortMinutes,
        averageEffortPerIssue: smells.averageEffortPerIssue || 0,
        issuesByCategory: smells.issuesByCategory || "{}",
        issuesByLevel: smells.issuesByLevel || "{}",
        issuesByLanguage: smells.issuesByLanguage || "{}",

        // Legacy fields
        duplicatedCode: smells.duplicatedCode || 0,
        similarCode: smells.similarCode || 0,
        highComplexityFunctions: smells.highComplexityFunctions || 0,
        highComplexityFiles: smells.highComplexityFiles || 0,
        manyParameterFunctions: smells.manyParameterFunctions || 0,
        complexBooleanLogic: smells.complexBooleanLogic || 0,
        deeplyNestedCode: smells.deeplyNestedCode || 0,
        manyReturnStatements: smells.manyReturnStatements || 0,

        // Derived metrics
        totalCodeSmells: smells.totalCodeSmells || 0,
        duplicatedLinesPercentage: metrics.duplicatedLinesPercentage || 0,
        averageComplexity: metrics.averageComplexity || 0,
        maxComplexity: metrics.maxComplexity || 0,
        complexityDensity,
        issuesDensity,
        technicalDebtMinutes: totalEffortMinutes,
        technicalDebtRatio,

        // Metadata
        analysisSuccess: true,
        analysisErrors: null,
        qltyVersion,
      };
    } catch (error) {
      console.error("Qlty analysis failed:", error);
      return this.createFailedMetrics((error as Error).message);
    }
  }

  private ensureOutputDir(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  private async ensureQltyInstalled(): Promise<string> {
    try {
      const { stdout } = await execAsync("qlty --version");
      const version = stdout.trim();
      console.log(`✅ Qlty version: ${version}`);
      return version;
    } catch (error) {
      console.log("📦 Installing Qlty CLI...");
      try {
        await execAsync("curl -sSL https://qlty.sh | sh");
        const { stdout } = await execAsync("qlty --version");
        const version = stdout.trim();
        console.log(`✅ Qlty installed: ${version}`);
        return version;
      } catch (installError) {
        throw new Error(
          `Failed to install Qlty: ${(installError as Error).message}`
        );
      }
    }
  }

  private async initializeQlty(): Promise<void> {
    try {
      console.log("🔧 Initializing Qlty configuration...");
      await execAsync("qlty init -n", {
        cwd: this.repoPath,
      });
      console.log("✅ Qlty configuration created successfully");
    } catch (error) {
      console.warn("⚠️ Qlty init had warnings, but continuing...");
    }
  }

  private async runCodeSmellsToFile(): Promise<void> {
    const outputFile = path.join(this.outputDir, "smells.json");
    console.log("🔍 Running code smells analysis...");

    try {
      const { stdout } = await execAsync("qlty smells --all --quiet --json", {
        cwd: this.repoPath,
        maxBuffer: 200 * 1024 * 1024,
      });

      const cleanedOutput = this.removeSnippetProperties(stdout);
      fs.writeFileSync(outputFile, cleanedOutput);
      console.log(`  Code smells JSON saved (${cleanedOutput.length} chars)`);
    } catch (error) {
      const execError = error as any;
      const output = execError.stdout || "[]";
      const cleanedOutput = this.removeSnippetProperties(output);
      fs.writeFileSync(outputFile, cleanedOutput);
      console.warn("Code smells command had issues, using partial output");
    }
  }

  private removeSnippetProperties(jsonString: string): string {
    return jsonString.replace(
      /"snippet".*?"effortMinutes"/gs,
      '"effortMinutes"'
    );
  }

  private async runMetricsToFile(): Promise<void> {
    const outputFile = path.join(this.outputDir, "metrics.txt");
    console.log("📊 Running metrics analysis...");

    try {
      const { stdout } = await execAsync("qlty metrics --all --quiet", {
        cwd: this.repoPath,
        maxBuffer: 200 * 1024 * 1024, // 200MB buffer instead of default 1MB
      });

      const cleanedOutput = this.stripAnsiCodes(stdout);
      const filteredOutput = this.filterMetricsOutput(cleanedOutput);
      fs.writeFileSync(outputFile, filteredOutput);
      console.log(`  Metrics.txt saved (${filteredOutput.length} chars)`);
    } catch (error) {
      const execError = error as any;
      const output = execError.stdout || "[]";
      const cleanedOutput = this.stripAnsiCodes(output);
      const filteredOutput = this.filterMetricsOutput(cleanedOutput);
      fs.writeFileSync(outputFile, filteredOutput);
      console.warn("Metrics command had issues, using partial output");
    }
  }

  private stripAnsiCodes(text: string): string {
    return text.replace(/\x1b\[[0-9;]*[mGKH]/g, "");
  }

  private filterMetricsOutput(output: string): string {
    return output
      .replace(/^[-]+(?=\+)/m, "--------") // Shorten first dash sequence (under name column) to 8
      .replace(/^ name\s+(?=\|)/m, " name   ") // Adjust name header to 8 chars total
      .replace(/^ TOTAL\s+(?=\|)/m, " TOTAL  ") // Adjust TOTAL to 8 chars total
      .replace(/(\+[-+]+\n).*?\n( TOTAL)/s, "$1$2"); // Remove everything between separator and TOTAL
  }

  private async parseCodeSmellsFile(): Promise<Partial<QltyMetrics>> {
    const filePath = path.join(this.outputDir, "smells.json");

    if (!fs.existsSync(filePath)) {
      return this.getEmptySmells();
    }

    try {
      const jsonContent = fs.readFileSync(filePath, "utf8");
      const data = JSON.parse(jsonContent);

      const issues = Array.isArray(data)
        ? data
        : data.issues || data.smells || [];

      // Initialize counters
      const categoryCount: Record<string, number> = {};
      const levelCount: Record<string, number> = {};
      const languageCount: Record<string, number> = {};
      const legacySmells = {
        duplicatedCode: 0,
        similarCode: 0,
        highComplexityFunctions: 0,
        highComplexityFiles: 0,
        manyParameterFunctions: 0,
        complexBooleanLogic: 0,
        deeplyNestedCode: 0,
        manyReturnStatements: 0,
      };

      let totalEffortMinutes = 0;
      let totalIssues = issues.length;

      console.log(`  Found ${totalIssues} issues in smells JSON`);

      // Process each issue
      for (const issue of issues) {
        // Aggregate effort minutes
        const effortMinutes = issue.effortMinutes || 0;
        totalEffortMinutes += effortMinutes;

        // Count by category
        const category = issue.category || "UNKNOWN";
        categoryCount[category] = (categoryCount[category] || 0) + 1;

        // Count by level
        const level = issue.level || "UNKNOWN";
        levelCount[level] = (levelCount[level] || 0) + 1;

        // Count by language
        const language = issue.language || "UNKNOWN";
        languageCount[language] = (languageCount[language] || 0) + 1;

        // Legacy rule-based counting
        const ruleKey = issue.ruleKey || "";
        switch (ruleKey) {
          case "identical-code":
            legacySmells.duplicatedCode++;
            break;
          case "similar-code":
            legacySmells.similarCode++;
            break;
          case "function-complexity":
            legacySmells.highComplexityFunctions++;
            break;
          case "file-complexity":
            legacySmells.highComplexityFiles++;
            break;
          case "function-parameters":
            legacySmells.manyParameterFunctions++;
            break;
          case "boolean-logic":
            legacySmells.complexBooleanLogic++;
            break;
          case "nested-control-flow":
            legacySmells.deeplyNestedCode++;
            break;
          case "return-statements":
            legacySmells.manyReturnStatements++;
            break;
        }
      }

      const averageEffortPerIssue =
        totalIssues > 0 ? totalEffortMinutes / totalIssues : 0;
      const totalCodeSmells = Object.values(legacySmells).reduce(
        (a, b) => a + b,
        0
      );

      console.log(
        `  Parsed: ${totalIssues} issues, ${totalEffortMinutes} effort minutes`
      );
      console.log(
        `  Categories: ${Object.keys(categoryCount).length}, Languages: ${
          Object.keys(languageCount).length
        }`
      );

      return {
        totalIssues,
        totalEffortMinutes,
        averageEffortPerIssue,
        issuesByCategory: JSON.stringify(categoryCount),
        issuesByLevel: JSON.stringify(levelCount),
        issuesByLanguage: JSON.stringify(languageCount),
        ...legacySmells,
        totalCodeSmells,
      };
    } catch (error) {
      console.warn("Error parsing smells JSON:", error);
      return this.getEmptySmells();
    }
  }

  private async parseMetricsFile(): Promise<Partial<QltyMetrics>> {
    const filePath = path.join(this.outputDir, "metrics.txt");

    if (!fs.existsSync(filePath)) {
      return this.getEmptyMetrics();
    }

    try {
      const content = fs.readFileSync(filePath, "utf8");

      // Look for the TOTAL row in the table format
      // Expected format: " TOTAL  |     773 |  3529 |   1322 |  5161 |    4399 |  364 | 74594 | 49475"
      const totalLineMatch = content.match(/^\s*TOTAL\s*\|(.+)$/m);

      if (!totalLineMatch) {
        console.warn("Could not find TOTAL row in metrics.txt");
        return this.getEmptyMetrics();
      }

      // Split the values and clean them
      const values = totalLineMatch[1]
        .split("|")
        .map((v) => v.trim())
        .filter((v) => v.length > 0)
        .map((v) => parseInt(v.replace(/,/g, "")) || 0);

      // Expected order based on header: classes | funcs | fields | cyclo | complex | LCOM | lines | LOC
      const [
        totalClasses = 0,
        totalFunctions = 0,
        totalFields = 0,
        complexity = 0,
        cognitiveComplexity = 0,
        lackOfCohesion = 0,
        totalLines = 0,
        linesOfCode = 0,
      ] = values;

      // Calculate derived metrics
      const averageComplexity =
        totalFunctions > 0 ? complexity / totalFunctions : 0;
      const maxComplexity = complexity; // We don't have individual function data, so use total as estimate

      console.log(
        `  Parsed metrics: LOC=${linesOfCode}, functions=${totalFunctions}, complexity=${complexity}`
      );

      return {
        linesOfCode,
        totalLines,
        complexity,
        cognitiveComplexity,
        totalFunctions,
        totalClasses,
        totalFields,
        lackOfCohesion,
        averageComplexity,
        maxComplexity,
        duplicatedLinesPercentage: 0, // Would need specific duplication analysis
      };
    } catch (error) {
      console.warn("Error parsing metrics.txt:", error);
      return this.getEmptyMetrics();
    }
  }

  private getEmptySmells(): Partial<QltyMetrics> {
    return {
      totalIssues: 0,
      totalEffortMinutes: 0,
      averageEffortPerIssue: 0,
      issuesByCategory: "{}",
      issuesByLevel: "{}",
      issuesByLanguage: "{}",
      duplicatedCode: 0,
      similarCode: 0,
      highComplexityFunctions: 0,
      highComplexityFiles: 0,
      manyParameterFunctions: 0,
      complexBooleanLogic: 0,
      deeplyNestedCode: 0,
      manyReturnStatements: 0,
      totalCodeSmells: 0,
    };
  }

  private getEmptyMetrics(): Partial<QltyMetrics> {
    return {
      linesOfCode: 0,
      totalLines: 0,
      complexity: 0,
      cognitiveComplexity: 0,
      totalFunctions: 0,
      totalClasses: 0,
      totalFields: 0,
      lackOfCohesion: 0,
      averageComplexity: 0,
      maxComplexity: 0,
      duplicatedLinesPercentage: 0,
    };
  }

  private createFailedMetrics(errorMessage: string): QltyMetrics {
    return {
      linesOfCode: 0,
      totalLines: 0,
      complexity: 0,
      cognitiveComplexity: 0,
      totalFunctions: 0,
      totalClasses: 0,
      totalFields: 0,
      lackOfCohesion: 0,
      totalIssues: 0,
      totalEffortMinutes: 0,
      averageEffortPerIssue: 0,
      issuesByCategory: "{}",
      issuesByLevel: "{}",
      issuesByLanguage: "{}",
      duplicatedCode: 0,
      similarCode: 0,
      highComplexityFunctions: 0,
      highComplexityFiles: 0,
      manyParameterFunctions: 0,
      complexBooleanLogic: 0,
      deeplyNestedCode: 0,
      manyReturnStatements: 0,
      totalCodeSmells: 0,
      duplicatedLinesPercentage: 0,
      averageComplexity: 0,
      maxComplexity: 0,
      complexityDensity: 0,
      issuesDensity: 0,
      technicalDebtMinutes: 0,
      technicalDebtRatio: 0,
      analysisSuccess: false,
      analysisErrors: JSON.stringify([errorMessage]),
      qltyVersion: "unknown",
    };
  }
}
