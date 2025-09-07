import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface QltyMetrics {
  linesOfCode: number;
  complexity: number;
  cognitiveComplexity: number;
  duplicatedCode: number;
  similarCode: number;
  highComplexityFunctions: number;
  highComplexityFiles: number;
  manyParameterFunctions: number;
  complexBooleanLogic: number;
  deeplyNestedCode: number;
  manyReturnStatements: number;
  totalCodeSmells: number;
  duplicatedLinesPercentage: number;
  averageComplexity: number;
  maxComplexity: number;
  totalFunctions: number;
  totalClasses: number;
  analysisSuccess: boolean;
  analysisErrors: string | null;
  qltyVersion: string;
}

export class QltyAnalyzer {
  private outputDir: string;
  private repoName: string;
  private analysisDate: string;

  /**
   * @param repoPath Path to the repo to analyze
   * @param outputBaseDir Base directory to save results (e.g. ./data/analysis_results)
   * @param analysisDate Date string (e.g. funding date or commit date)
   */
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
      // Ensure Qlty is installed and get version
      const qltyVersion = await this.ensureQltyInstalled();

      // Always re-initialize Qlty config before each analysis
      await this.initializeQlty();

      // Run analyses and save JSON to files
      await this.runCodeSmellsToFile();
      await this.runMetricsToFile();

      // Parse JSON results from files
      const smells = await this.parseCodeSmellsFile();
      const metrics = await this.parseMetricsFile();

      // Combine and return results
      return {
        linesOfCode: metrics.linesOfCode ?? 0,
        complexity: metrics.complexity ?? 0,
        cognitiveComplexity: metrics.cognitiveComplexity ?? 0,
        duplicatedCode: smells.duplicatedCode ?? 0,
        similarCode: smells.similarCode ?? 0,
        highComplexityFunctions: smells.highComplexityFunctions ?? 0,
        highComplexityFiles: smells.highComplexityFiles ?? 0,
        manyParameterFunctions: smells.manyParameterFunctions ?? 0,
        complexBooleanLogic: smells.complexBooleanLogic ?? 0,
        deeplyNestedCode: smells.deeplyNestedCode ?? 0,
        manyReturnStatements: smells.manyReturnStatements ?? 0,
        totalCodeSmells: smells.totalCodeSmells ?? 0,
        duplicatedLinesPercentage: metrics.duplicatedLinesPercentage ?? 0,
        averageComplexity: metrics.averageComplexity ?? 0,
        maxComplexity: metrics.maxComplexity ?? 0,
        totalFunctions: metrics.totalFunctions ?? 0,
        totalClasses: metrics.totalClasses ?? 0,
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
        maxBuffer: 200 * 1024 * 1024, // 200MB buffer instead of default 1MB
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
    // Remove everything from "snippet" through "snippetWithContext" up to "effortMinutes" to reduce size
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
    // Remove ANSI escape sequences
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

      // Count different types of code smells from the JSON structure
      const smellCounts = {
        duplicatedCode: 0,
        similarCode: 0,
        highComplexityFunctions: 0,
        highComplexityFiles: 0,
        manyParameterFunctions: 0,
        complexBooleanLogic: 0,
        deeplyNestedCode: 0,
        manyReturnStatements: 0,
      };

      // Handle different possible JSON structures from qlty
      const issues = Array.isArray(data)
        ? data
        : data.issues || data.smells || [];

      console.log(`  Found ${issues.length} issues in smells JSON`);

      // Parse the issues array and categorize by ruleKey
      for (const issue of issues) {
        const ruleKey = issue.ruleKey || issue.rule_key || "";

        switch (ruleKey) {
          case "identical-code":
            smellCounts.duplicatedCode++;
            break;
          case "similar-code":
            smellCounts.similarCode++;
            break;
          case "function-complexity":
            smellCounts.highComplexityFunctions++;
            break;
          case "file-complexity":
            smellCounts.highComplexityFiles++;
            break;
          case "function-parameters":
            smellCounts.manyParameterFunctions++;
            break;
          case "boolean-logic":
            smellCounts.complexBooleanLogic++;
            break;
          case "nested-control-flow":
            smellCounts.deeplyNestedCode++;
            break;
          case "return-statements":
            smellCounts.manyReturnStatements++;
            break;
        }
      }

      const totalCodeSmells = Object.values(smellCounts).reduce(
        (a, b) => a + b,
        0
      );

      console.log(`  Parsed ${totalCodeSmells} code smells from JSON`);
      console.log(
        `  Breakdown: duplicated=${smellCounts.duplicatedCode}, similar=${
          smellCounts.similarCode
        }, complexity=${
          smellCounts.highComplexityFunctions + smellCounts.highComplexityFiles
        }`
      );

      return {
        ...smellCounts,
        totalCodeSmells,
      };
    } catch (error) {
      console.warn("Error parsing smells JSON:", error);
      return this.getEmptySmells();
    }
  }

  private async parseMetricsFile(): Promise<Partial<QltyMetrics>> {
    const filePath = path.join(this.outputDir, "metrics.json");

    if (!fs.existsSync(filePath)) {
      return this.getEmptyMetrics();
    }

    try {
      const jsonContent = fs.readFileSync(filePath, "utf8");
      const metrics = JSON.parse(jsonContent);

      let linesOfCode = 0;
      let complexity = 0;
      let cognitiveComplexity = 0;
      let totalFunctions = 0;
      let totalClasses = 0;
      let maxComplexity = 0;
      const complexityValues: number[] = [];

      // Parse metrics from JSON structure
      if (Array.isArray(metrics)) {
        for (const metric of metrics) {
          // Sum up various metrics based on common field names
          linesOfCode +=
            metric.lines_of_code || metric.loc || metric.lines || 0;
          complexity +=
            metric.cyclomatic_complexity ||
            metric.complexity ||
            metric.cyclo ||
            0;
          cognitiveComplexity +=
            metric.cognitive_complexity || metric.cognitive || 0;
          totalFunctions +=
            metric.functions || metric.funcs || metric.methods || 0;
          totalClasses += metric.classes || 0;

          const fileComplexity =
            metric.cyclomatic_complexity || metric.complexity || 0;
          if (fileComplexity > 0) {
            complexityValues.push(fileComplexity);
            maxComplexity = Math.max(maxComplexity, fileComplexity);
          }
        }
      } else if (typeof metrics === "object" && metrics !== null) {
        // Handle case where metrics is a single object rather than array
        linesOfCode =
          metrics.lines_of_code || metrics.loc || metrics.lines || 0;
        complexity =
          metrics.cyclomatic_complexity ||
          metrics.complexity ||
          metrics.cyclo ||
          0;
        cognitiveComplexity =
          metrics.cognitive_complexity || metrics.cognitive || complexity;
        totalFunctions =
          metrics.functions || metrics.funcs || metrics.methods || 0;
        totalClasses = metrics.classes || 0;
        maxComplexity = complexity;
        if (complexity > 0) complexityValues.push(complexity);
      }

      const averageComplexity =
        complexityValues.length > 0
          ? complexityValues.reduce((a, b) => a + b, 0) /
            complexityValues.length
          : 0;

      console.log(
        `  Parsed metrics: LOC=${linesOfCode}, complexity=${complexity}, functions=${totalFunctions}`
      );

      return {
        linesOfCode,
        complexity,
        cognitiveComplexity,
        averageComplexity,
        maxComplexity,
        totalFunctions,
        totalClasses,
        duplicatedLinesPercentage: 0, // Would need specific duplication analysis
      };
    } catch (error) {
      console.warn("Error parsing metrics JSON:", error);
      return this.getEmptyMetrics();
    }
  }

  private getEmptySmells(): Partial<QltyMetrics> {
    return {
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
      complexity: 0,
      cognitiveComplexity: 0,
      averageComplexity: 0,
      maxComplexity: 0,
      totalFunctions: 0,
      totalClasses: 0,
      duplicatedLinesPercentage: 0,
    };
  }

  private createFailedMetrics(errorMessage: string): QltyMetrics {
    return {
      linesOfCode: 0,
      complexity: 0,
      cognitiveComplexity: 0,
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
      totalFunctions: 0,
      totalClasses: 0,
      analysisSuccess: false,
      analysisErrors: JSON.stringify([errorMessage]),
      qltyVersion: "unknown",
    };
  }
}
