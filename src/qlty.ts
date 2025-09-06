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
  constructor(private repoPath: string) {}

  async runAnalysis(): Promise<QltyMetrics> {
    try {
      // Ensure Qlty is installed and get version
      const qltyVersion = await this.ensureQltyInstalled();

      // Initialize Qlty in the repository
      await this.initializeQlty();

      // Run code smells analysis
      const smells = await this.getCodeSmells();

      // Run metrics analysis
      const metrics = await this.getMetrics();

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
      // Check if .qlty directory already exists
      const qltyDir = path.join(this.repoPath, ".qlty");
      if (!fs.existsSync(qltyDir)) {
        console.log("🔧 Initializing Qlty configuration...");
        await execAsync("qlty init", {
          cwd: this.repoPath,
          env: { ...process.env, TERM: "dumb" }, // Set non-interactive terminal
        });
      }
    } catch (error) {
      // Check if initialization actually succeeded despite the error
      const qltyDir = path.join(this.repoPath, ".qlty");
      if (fs.existsSync(qltyDir)) {
        console.log(
          "✅ Qlty configuration created successfully (ignoring terminal warning)"
        );
      } else {
        console.warn(
          "⚠️ Qlty initialization failed, proceeding without config:",
          (error as Error).message
        );
      }
    }
  }

  private async getCodeSmells(): Promise<Partial<QltyMetrics>> {
    try {
      console.log("🔍 Running code smells analysis...");
      const { stdout } = await execAsync("qlty smells --all --quiet", {
        cwd: this.repoPath,
        timeout: 300000, // 5 minute timeout
      });

      // Parse the output to count different types of smells
      const lines = stdout.split("\n").filter((line) => line.trim());

      let duplicatedCode = 0;
      let similarCode = 0;
      let highComplexityFunctions = 0;
      let highComplexityFiles = 0;
      let manyParameterFunctions = 0;
      let complexBooleanLogic = 0;
      let deeplyNestedCode = 0;
      let manyReturnStatements = 0;

      for (const line of lines) {
        const lowerLine = line.toLowerCase();

        if (
          lowerLine.includes("identical code") ||
          lowerLine.includes("duplicate")
        ) {
          duplicatedCode++;
        } else if (lowerLine.includes("similar code")) {
          similarCode++;
        } else if (
          lowerLine.includes("function complexity") ||
          lowerLine.includes("method complexity")
        ) {
          highComplexityFunctions++;
        } else if (lowerLine.includes("file complexity")) {
          highComplexityFiles++;
        } else if (
          lowerLine.includes("many parameters") ||
          lowerLine.includes("parameter count")
        ) {
          manyParameterFunctions++;
        } else if (
          lowerLine.includes("boolean logic") ||
          lowerLine.includes("complex condition")
        ) {
          complexBooleanLogic++;
        } else if (
          lowerLine.includes("nested") ||
          lowerLine.includes("nesting")
        ) {
          deeplyNestedCode++;
        } else if (
          lowerLine.includes("return statement") ||
          lowerLine.includes("many returns")
        ) {
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
      console.warn("Warning: Code smells analysis failed:", error);
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
  }

  private async getMetrics(): Promise<Partial<QltyMetrics>> {
    try {
      console.log("📊 Running metrics analysis...");
      const { stdout } = await execAsync("qlty metrics --all --quiet", {
        cwd: this.repoPath,
        timeout: 300000, // 5 minute timeout
      });

      // Parse the metrics output
      let linesOfCode = 0;
      let complexity = 0;
      let cognitiveComplexity = 0;
      let totalFunctions = 0;
      let totalClasses = 0;
      let maxComplexity = 0;
      let complexitySum = 0;
      let complexityCount = 0;

      const lines = stdout.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        // Try to extract numeric values from the output
        // This is a basic parser - Qlty's output format may vary
        const numbers = line.match(/\d+/g);
        if (!numbers) continue;

        const lowerLine = line.toLowerCase();

        if (lowerLine.includes("lines") && lowerLine.includes("code")) {
          linesOfCode += parseInt(numbers[0] || "0");
        } else if (lowerLine.includes("complexity")) {
          const complexityValue = parseInt(numbers[0] || "0");
          complexity += complexityValue;
          maxComplexity = Math.max(maxComplexity, complexityValue);
          complexitySum += complexityValue;
          complexityCount++;
        } else if (lowerLine.includes("function")) {
          totalFunctions += parseInt(numbers[0] || "0");
        } else if (lowerLine.includes("class")) {
          totalClasses += parseInt(numbers[0] || "0");
        }
      }

      const averageComplexity =
        complexityCount > 0 ? complexitySum / complexityCount : 0;

      // For cognitive complexity, use the same value as complexity for now
      // Qlty may provide this separately in future versions
      cognitiveComplexity = complexity;

      // Estimate duplication percentage (this would need to be refined based on actual Qlty output)
      const duplicatedLinesPercentage = 0; // Would need to parse duplication output specifically

      return {
        linesOfCode,
        complexity,
        cognitiveComplexity,
        averageComplexity,
        maxComplexity,
        totalFunctions,
        totalClasses,
        duplicatedLinesPercentage,
      };
    } catch (error) {
      console.warn("Warning: Metrics analysis failed:", error);
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
