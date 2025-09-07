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

  constructor(
    private repoPath: string,
    outputBaseDir: string,
    private companyName: string,
    private analysisDate: string,
    private roundType: string
  ) {
    // Create folder structure: outputBaseDir/companyName/roundType_date
    this.outputDir = path.join(
      outputBaseDir,
      companyName,
      `${roundType}_${analysisDate}`
    );
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

      // Technical debt ratio: effort minutes / estimated development time (1 LOC = 0.5 minutes)
      const estimatedDevMinutes = linesOfCode * 0.5;
      const technicalDebtRatio =
        estimatedDevMinutes > 0 ? totalEffortMinutes / estimatedDevMinutes : 0;

      return {
        linesOfCode,
        totalLines: metrics.totalLines || 0,
        complexity,
        cognitiveComplexity: metrics.cognitiveComplexity || 0,
        totalFunctions: metrics.totalFunctions || 0,
        totalClasses: metrics.totalClasses || 0,
        totalFields: metrics.totalFields || 0,
        lackOfCohesion: metrics.lackOfCohesion || 0,
        totalIssues,
        totalEffortMinutes,
        averageEffortPerIssue: smells.averageEffortPerIssue || 0,
        issuesByCategory: smells.issuesByCategory || "{}",
        issuesByLevel: smells.issuesByLevel || "{}",
        issuesByLanguage: smells.issuesByLanguage || "{}",
        duplicatedCode: smells.duplicatedCode || 0,
        similarCode: smells.similarCode || 0,
        highComplexityFunctions: smells.highComplexityFunctions || 0,
        highComplexityFiles: smells.highComplexityFiles || 0,
        manyParameterFunctions: smells.manyParameterFunctions || 0,
        complexBooleanLogic: smells.complexBooleanLogic || 0,
        deeplyNestedCode: smells.deeplyNestedCode || 0,
        manyReturnStatements: smells.manyReturnStatements || 0,
        totalCodeSmells: smells.totalCodeSmells || 0,
        averageComplexity: metrics.averageComplexity || 0,
        maxComplexity: metrics.maxComplexity || 0,
        complexityDensity,
        issuesDensity,
        technicalDebtMinutes: totalEffortMinutes,
        technicalDebtRatio,
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
    // First try with current PATH
    try {
      const { stdout } = await execAsync("qlty --version");
      return stdout.trim();
    } catch (error) {
      // Try with common installation path
      try {
        const { stdout } = await execAsync("~/.local/bin/qlty --version");
        // Add to PATH for subsequent commands
        process.env.PATH = `${process.env.HOME}/.local/bin:${process.env.PATH}`;
        return stdout.trim();
      } catch (secondError) {
        // Install qlty
        console.log("📦 Installing Qlty CLI...");
        await execAsync("curl -sSL https://qlty.sh | sh");

        // Update PATH to include the installation directory
        process.env.PATH = `${process.env.HOME}/.local/bin:${process.env.PATH}`;

        // Verify installation
        const { stdout } = await execAsync("qlty --version");
        console.log(`✅ Qlty installed: ${stdout.trim()}`);
        return stdout.trim();
      }
    }
  }

  private async initializeQlty(): Promise<void> {
    await execAsync("qlty init -n", { cwd: this.repoPath });
  }

  private async runCodeSmellsToFile(): Promise<void> {
    const outputFile = path.join(this.outputDir, "smells.json");

    const { stdout } = await execAsync("qlty smells --all --quiet --json", {
      cwd: this.repoPath,
      maxBuffer: 4 * 1024 * 1024 * 1024, // 4GB
    });

    const cleanedOutput = this.removeSnippetProperties(stdout);
    fs.writeFileSync(outputFile, cleanedOutput);
  }

  private removeSnippetProperties(jsonString: string): string {
    // Regex that removes both "snippet" and "snippetWithContext" properties to save space
    return jsonString.replace(
      /"(?:snippet|snippetWithContext)"\s*:\s*"(?:[^"\\]|\\.)*"\s*,?\s*/g,
      ""
    );
  }

  private async runMetricsToFile(): Promise<void> {
    const outputFile = path.join(this.outputDir, "metrics.txt");

    const { stdout } = await execAsync("qlty metrics --all --quiet", {
      cwd: this.repoPath,
      maxBuffer: 4 * 1024 * 1024 * 1024, // 4GB
    });

    const cleanedOutput = this.stripAnsiCodes(stdout);
    const filteredOutput = this.filterMetricsOutput(cleanedOutput);
    fs.writeFileSync(outputFile, filteredOutput);
  }

  private stripAnsiCodes(text: string): string {
    return text.replace(/\x1b\[[0-9;]*[mGKH]/g, "");
  }

  private filterMetricsOutput(output: string): string {
    return output
      .replace(/^[-]+(?=\+)/m, "--------")
      .replace(/^ name\s+(?=\|)/m, " name   ")
      .replace(/^ TOTAL\s+(?=\|)/m, " TOTAL  ")
      .replace(/(\+[-+]+\n).*?\n( TOTAL)/s, "$1$2");
  }

  private async parseCodeSmellsFile(): Promise<Partial<QltyMetrics>> {
    const filePath = path.join(this.outputDir, "smells.json");

    if (!fs.existsSync(filePath)) {
      return this.getEmptySmells();
    }

    const jsonContent = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(jsonContent);
    const issues = Array.isArray(data)
      ? data
      : data.issues || data.smells || [];

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

    for (const issue of issues) {
      totalEffortMinutes += issue.effortMinutes || 0;

      const category = issue.category || "UNKNOWN";
      categoryCount[category] = (categoryCount[category] || 0) + 1;

      const level = issue.level || "UNKNOWN";
      levelCount[level] = (levelCount[level] || 0) + 1;

      const language = issue.language || "UNKNOWN";
      languageCount[language] = (languageCount[language] || 0) + 1;

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
  }

  private async parseMetricsFile(): Promise<Partial<QltyMetrics>> {
    const filePath = path.join(this.outputDir, "metrics.txt");

    if (!fs.existsSync(filePath)) {
      return this.getEmptyMetrics();
    }

    const content = fs.readFileSync(filePath, "utf8");
    const totalLineMatch = content.match(/^\s*TOTAL\s*\|(.+)$/m);

    if (!totalLineMatch) {
      return this.getEmptyMetrics();
    }

    const values = totalLineMatch[1]!
      .split("|")
      .map((v) => v.trim())
      .filter((v) => v.length > 0)
      .map((v) => parseInt(v.replace(/,/g, "")) || 0);

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

    const averageComplexity =
      totalFunctions > 0 ? complexity / totalFunctions : 0;
    const maxComplexity = complexity;

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
    };
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
