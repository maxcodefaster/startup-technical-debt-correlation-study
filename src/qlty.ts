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
      console.log("🔧 Initializing Qlty configuration (always)...");
      const { stdout, stderr } = await execAsync("qlty init -n", {
        cwd: this.repoPath,
        env: {
          ...process.env,
          PATH: process.env.PATH,
          CI: "true",
        },
      });
      if (stdout.trim()) {
        console.log("qlty init stdout:", stdout.trim());
      }
      if (stderr.trim()) {
        console.warn("qlty init stderr:", stderr.trim());
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
      // Run and capture output directly, ensure TERM and PATH are set
      const { stdout, stderr } = await execAsync("qlty smells --all --quiet", {
        cwd: this.repoPath,
        env: { ...process.env, PATH: process.env.PATH },
        timeout: 300000,
      });
      const output = stdout + (stderr ? `\n# STDERR:\n${stderr}` : "");
      fs.writeFileSync(outputFile, output);
    } catch (error) {
      // Even if command "fails", there might be useful output
      const execError = error as any;
      const output =
        (execError.stdout || "") +
        (execError.stderr ? `\n# STDERR:\n${execError.stderr}` : "");
      fs.writeFileSync(outputFile, output || "# No smells output generated\n");
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
          env: { ...process.env, PATH: process.env.PATH },
          timeout: 300000,
        }
      );

      fs.writeFileSync(
        debugFile,
        `VERBOSE OUTPUT:\n${verboseOutput}\n\nVERBOSE STDERR:\n${verboseError}\n`
      );

      // Now try with --quiet
      const { stdout, stderr } = await execAsync("qlty metrics --all --quiet", {
        cwd: this.repoPath,
        env: { ...process.env, PATH: process.env.PATH },
        timeout: 300000,
      });

      const output = stdout + (stderr ? `\n# STDERR:\n${stderr}` : "");
      fs.writeFileSync(outputFile, output);

      console.log(`  Metrics output length: ${stdout.length} chars`);
      if (stdout.length < 10) {
        console.log(`  Short output content: "${stdout}"`);
      }
    } catch (error) {
      const execError = error as any;
      const output =
        (execError.stdout || "") +
        (execError.stderr ? `\n# STDERR:\n${execError.stderr}` : "");
      fs.writeFileSync(outputFile, output || "# No metrics output generated\n");

      // Also save debug info
      fs.writeFileSync(
        debugFile,
        `ERROR: ${execError.message}\nSTDOUT: ${execError.stdout}\nSTDERR: ${execError.stderr}`
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
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith("#")) continue;

        const lowerLine = trimmedLine.toLowerCase();

        // More specific pattern matching for different smell types
        if (
          lowerLine.includes("identical") ||
          lowerLine.includes("duplicated")
        ) {
          duplicatedCode++;
        } else if (lowerLine.includes("similar")) {
          similarCode++;
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

      for await (const line of rl) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith("#")) continue;

        // Look for numeric values in the line
        const numbers = trimmedLine.match(/\b\d+(?:\.\d+)?\b/g);
        if (!numbers || numbers.length === 0) continue;

        const lowerLine = trimmedLine.toLowerCase();
        const firstNumber = parseFloat(numbers[0]);

        // Parse different metric types
        if (
          lowerLine.includes("lines") &&
          (lowerLine.includes("code") || lowerLine.includes("loc"))
        ) {
          linesOfCode += firstNumber;
        } else if (lowerLine.includes("complexity")) {
          complexity += firstNumber;
          complexityValues.push(firstNumber);
          maxComplexity = Math.max(maxComplexity, firstNumber);
        } else if (
          lowerLine.includes("function") &&
          !lowerLine.includes("complexity")
        ) {
          totalFunctions += firstNumber;
        } else if (lowerLine.includes("class")) {
          totalClasses += firstNumber;
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
