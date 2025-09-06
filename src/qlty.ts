import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { createReadStream } from "fs";
import { createInterface } from "readline";

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

  /**
   * Strip ANSI escape codes from text
   */
  private stripAnsiCodes(text: string): string {
    // Remove ANSI escape sequences
    return text.replace(/\x1b\[[0-9;]*[mGKH]/g, "");
  }

  /**
   * Get environment variables that disable color output
   */
  private getNoColorEnv() {
    return {
      ...process.env,
      // Disable colors and terminal detection
      NO_COLOR: "1",
      TERM: "dumb",
      CI: "true",
      FORCE_COLOR: "0",
      // Ensure PATH is preserved
      PATH: process.env.PATH,
    };
  }

  async runAnalysis(): Promise<QltyMetrics> {
    try {
      // Ensure Qlty is installed and get version
      const qltyVersion = await this.ensureQltyInstalled();

      // Always re-initialize Qlty config before each analysis (after commit checkout)
      await this.initializeQlty();

      // Run analyses and save to files in outputDir
      await this.runCodeSmellsToFile();
      await this.runMetricsToFile();

      // Parse results from files
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
      const { stdout } = await execAsync("qlty --version", {
        env: this.getNoColorEnv(),
      });
      const version = this.stripAnsiCodes(stdout.trim());
      console.log(`✅ Qlty version: ${version}`);
      return version;
    } catch (error) {
      console.log("📦 Installing Qlty CLI...");
      try {
        await execAsync("curl -sSL https://qlty.sh | sh");
        const { stdout } = await execAsync("qlty --version", {
          env: this.getNoColorEnv(),
        });
        const version = this.stripAnsiCodes(stdout.trim());
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
      console.log("🔧 Initializing Qlty configuration (always)...");
      const { stdout, stderr } = await execAsync("qlty init -n", {
        cwd: this.repoPath,
        env: this.getNoColorEnv(),
      });
      if (stdout.trim()) {
        console.log("qlty init stdout:", this.stripAnsiCodes(stdout.trim()));
      }
      if (stderr.trim()) {
        console.warn("qlty init stderr:", this.stripAnsiCodes(stderr.trim()));
      }
      const qltyDir = path.join(this.repoPath, ".qlty");
      if (fs.existsSync(qltyDir)) {
        console.log("✅ Qlty configuration created successfully");
      } else {
        console.warn(
          "⚠️ Qlty initialization failed, .qlty not found after init"
        );
      }
    } catch (error) {
      console.error("❌ Qlty init failed:", (error as Error).message);
      const qltyDir = path.join(this.repoPath, ".qlty");
      if (fs.existsSync(qltyDir)) {
        console.log("✅ Qlty configuration created successfully (after error)");
      } else {
        console.warn(
          "⚠️ Qlty initialization failed, .qlty not found after error"
        );
      }
    }
  }

  private async runCodeSmellsToFile(): Promise<void> {
    const outputFile = path.join(this.outputDir, "smells.txt");
    console.log("🔍 Running code smells analysis...");

    try {
      // Run and capture output directly, with no-color environment
      const { stdout, stderr } = await execAsync("qlty smells --all --quiet", {
        cwd: this.repoPath,
        env: this.getNoColorEnv(),
        timeout: 300000,
      });

      // Strip ANSI codes before saving
      const cleanOutput =
        this.stripAnsiCodes(stdout) +
        (stderr ? `\n# STDERR:\n${this.stripAnsiCodes(stderr)}` : "");

      fs.writeFileSync(outputFile, cleanOutput);
      console.log(`  Code smells output saved (${cleanOutput.length} chars)`);
    } catch (error) {
      // Even if command "fails", there might be useful output
      const execError = error as any;
      const cleanOutput =
        this.stripAnsiCodes(execError.stdout || "") +
        (execError.stderr
          ? `\n# STDERR:\n${this.stripAnsiCodes(execError.stderr)}`
          : "");

      fs.writeFileSync(
        outputFile,
        cleanOutput || "# No smells output generated\n"
      );
      console.warn(
        "Code smells command had issues, but checking output file..."
      );
    }

    // Verify file was created
    if (!fs.existsSync(outputFile)) {
      fs.writeFileSync(outputFile, "# No smells output generated\n");
    }
  }

  private async runMetricsToFile(): Promise<void> {
    const outputFile = path.join(this.outputDir, "metrics.txt");
    const debugFile = path.join(this.outputDir, "metrics-debug.txt");
    console.log("📊 Running metrics analysis...");

    try {
      // Try running without --quiet first to see what qlty is doing
      console.log("  Running qlty metrics with verbose output...");
      const { stdout: verboseOutput, stderr: verboseError } = await execAsync(
        "qlty metrics --all",
        {
          cwd: this.repoPath,
          env: this.getNoColorEnv(),
          timeout: 300000,
        }
      );

      const cleanVerboseOutput = this.stripAnsiCodes(verboseOutput);
      const cleanVerboseError = this.stripAnsiCodes(verboseError);

      fs.writeFileSync(
        debugFile,
        `VERBOSE OUTPUT:\n${cleanVerboseOutput}\n\nVERBOSE STDERR:\n${cleanVerboseError}\n`
      );

      // Now try with --quiet
      const { stdout, stderr } = await execAsync("qlty metrics --all --quiet", {
        cwd: this.repoPath,
        env: this.getNoColorEnv(),
        timeout: 300000,
      });

      // Strip ANSI codes before saving
      const cleanOutput =
        this.stripAnsiCodes(stdout) +
        (stderr ? `\n# STDERR:\n${this.stripAnsiCodes(stderr)}` : "");

      fs.writeFileSync(outputFile, cleanOutput);

      console.log(`  Metrics output length: ${cleanOutput.length} chars`);
      if (cleanOutput.length < 100) {
        console.log(`  Output preview: "${cleanOutput.substring(0, 200)}..."`);
      }
    } catch (error) {
      const execError = error as any;
      const cleanOutput =
        this.stripAnsiCodes(execError.stdout || "") +
        (execError.stderr
          ? `\n# STDERR:\n${this.stripAnsiCodes(execError.stderr)}`
          : "");

      fs.writeFileSync(
        outputFile,
        cleanOutput || "# No metrics output generated\n"
      );

      // Also save debug info
      fs.writeFileSync(
        debugFile,
        `ERROR: ${execError.message}\nSTDOUT: ${this.stripAnsiCodes(
          execError.stdout || ""
        )}\nSTDERR: ${this.stripAnsiCodes(execError.stderr || "")}`
      );
      console.warn("Metrics command failed:", execError.message);
    }
  }

  private async parseCodeSmellsFile(): Promise<Partial<QltyMetrics>> {
    const filePath = path.join(this.outputDir, "smells.txt");

    if (!fs.existsSync(filePath)) {
      return this.getEmptySmells();
    }

    let duplicatedCode = 0;
    let similarCode = 0;
    let highComplexityFunctions = 0;
    let highComplexityFiles = 0;
    let manyParameterFunctions = 0;
    let complexBooleanLogic = 0;
    let deeplyNestedCode = 0;
    let manyReturnStatements = 0;

    try {
      const fileStream = createReadStream(filePath);
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity, // Handle Windows line endings
      });

      for await (const line of rl) {
        // Strip any remaining ANSI codes and trim
        const cleanLine = this.stripAnsiCodes(line).trim();
        if (!cleanLine || cleanLine.startsWith("#")) continue;

        const lowerLine = cleanLine.toLowerCase();

        // Look for smell patterns in the text
        if (lowerLine.includes("found") && lowerLine.includes("similar code")) {
          similarCode++;
        } else if (
          lowerLine.includes("found") &&
          (lowerLine.includes("identical") || lowerLine.includes("duplicate"))
        ) {
          duplicatedCode++;
        } else if (
          lowerLine.includes("complex") &&
          (lowerLine.includes("function") || lowerLine.includes("method"))
        ) {
          highComplexityFunctions++;
        } else if (
          lowerLine.includes("complex") &&
          lowerLine.includes("file")
        ) {
          highComplexityFiles++;
        } else if (
          lowerLine.includes("parameter") &&
          lowerLine.includes("many")
        ) {
          manyParameterFunctions++;
        } else if (
          lowerLine.includes("boolean") ||
          lowerLine.includes("condition")
        ) {
          complexBooleanLogic++;
        } else if (
          lowerLine.includes("nested") ||
          lowerLine.includes("nesting")
        ) {
          deeplyNestedCode++;
        } else if (lowerLine.includes("return") && lowerLine.includes("many")) {
          manyReturnStatements++;
        }
      }

      const totalCodeSmells =
        duplicatedCode +
        similarCode +
        highComplexityFunctions +
        highComplexityFiles +
        manyParameterFunctions +
        complexBooleanLogic +
        deeplyNestedCode +
        manyReturnStatements;

      console.log(
        `  Parsed smells: ${totalCodeSmells} total (similar: ${similarCode}, duplicated: ${duplicatedCode})`
      );

      return {
        duplicatedCode,
        similarCode,
        highComplexityFunctions,
        highComplexityFiles,
        manyParameterFunctions,
        complexBooleanLogic,
        deeplyNestedCode,
        manyReturnStatements,
        totalCodeSmells,
      };
    } catch (error) {
      console.warn("Error parsing smells file:", error);
      return this.getEmptySmells();
    }
  }

  private async parseMetricsFile(): Promise<Partial<QltyMetrics>> {
    const filePath = path.join(this.outputDir, "metrics.txt");

    if (!fs.existsSync(filePath)) {
      return this.getEmptyMetrics();
    }

    let linesOfCode = 0;
    let complexity = 0;
    let cognitiveComplexity = 0;
    let totalFunctions = 0;
    let totalClasses = 0;
    let maxComplexity = 0;
    let complexityValues: number[] = [];

    try {
      const fileStream = createReadStream(filePath);
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      let foundHeader = false;
      let isDataRow = false;

      for await (const line of rl) {
        // Strip any remaining ANSI codes and trim
        const cleanLine = this.stripAnsiCodes(line).trim();
        if (!cleanLine || cleanLine.startsWith("#")) continue;

        // Check if this looks like a table header
        if (
          cleanLine.includes("name") &&
          cleanLine.includes("classes") &&
          cleanLine.includes("funcs")
        ) {
          foundHeader = true;
          console.log("  Found metrics table header");
          continue;
        }

        // Check if this is a separator line (dashes and plus signs)
        if (foundHeader && cleanLine.match(/^[-+|]+$/)) {
          isDataRow = true;
          continue;
        }

        // Parse data rows if we've found the table structure
        if (isDataRow && cleanLine.includes("|")) {
          // Split by | and clean up values
          const columns = cleanLine.split("|").map((col) => col.trim());

          if (columns.length >= 9) {
            // Should have at least: name, classes, funcs, fields, cyclo, complex, LCOM, lines, LOC
            try {
              const classesCol = parseInt(columns[1] || "0") || 0;
              const funcsCol = parseInt(columns[2] || "0") || 0;
              const cycloCol = parseInt(columns[4] || "0") || 0;
              const complexCol = parseInt(columns[5] || "0") || 0;
              const linesCol = parseInt(columns[7] || "0") || 0;
              const locCol = parseInt(columns[8] || "0") || 0;

              totalClasses += classesCol;
              totalFunctions += funcsCol;
              complexity += cycloCol;
              linesOfCode += locCol; // Use LOC (lines of code) rather than total lines

              if (cycloCol > 0) {
                complexityValues.push(cycloCol);
                maxComplexity = Math.max(maxComplexity, cycloCol);
              }

              console.log(
                `    Parsed row: ${columns[0]?.substring(
                  0,
                  30
                )}... -> classes:${classesCol}, funcs:${funcsCol}, cyclo:${cycloCol}, loc:${locCol}`
              );
            } catch (parseError) {
              console.warn(
                `    Failed to parse row: ${cleanLine.substring(0, 50)}...`
              );
            }
          }
        }
      }

      // Calculate average complexity
      const averageComplexity =
        complexityValues.length > 0
          ? complexityValues.reduce((a, b) => a + b, 0) /
            complexityValues.length
          : 0;

      // Use complexity value for cognitive complexity if not separately provided
      cognitiveComplexity = complexity;

      console.log(
        `  Parsed metrics: LOC=${linesOfCode}, classes=${totalClasses}, funcs=${totalFunctions}, complexity=${complexity}`
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
      console.warn("Error parsing metrics file:", error);
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
