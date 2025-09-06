import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Configuration from environment
const SONAR_URL = process.env.SONAR_URL || "http://localhost:9000";
const SONAR_TOKEN = process.env.SONAR_TOKEN;

if (!SONAR_TOKEN) {
  console.error("❌ SONAR_TOKEN environment variable is required!");
  console.error("Please set your SonarQube token in .env file");
  process.exit(1);
}

export interface SonarMetrics {
  ncloc: number;
  sqaleIndex: number;
  sqaleRating: string | null;
  sqaleDebtRatio: number;
  codeSmells: number;
  bugs: number;
  vulnerabilities: number;
  securityHotspots: number;
  duplicatedLinesDensity: number;
  complexity: number;
  cognitiveComplexity: number;
  coverage: number;
  lineCoverage: number;
  reliabilityRating: string | null;
  securityRating: string | null;
  maintainabilityRating: string | null;
  alertStatus: string | null;
  tdDensity: number;
  qualityScore: number;
  sonarProjectKey: string;
  analysisSuccess: boolean;
  analysisErrors: string | null;
}

export class SonarAnalyzer {
  constructor(private repoPath: string) {}

  async runAnalysis(projectKey: string): Promise<SonarMetrics> {
    try {
      // Ensure scanner container is running
      await this.ensureScannerContainer();

      // Create sonar-project.properties
      await this.createSonarProperties(projectKey);

      // Get relative path for Docker volume mount
      const relativePath = path.relative("./repos", this.repoPath);

      // Run SonarQube analysis via Docker
      console.log(`Running SonarQube analysis for ${projectKey}...`);
      await execAsync(
        `docker exec sonar-scanner sonar-scanner -Dproject.settings=/usr/src/${relativePath}/sonar-project.properties`,
        {
          timeout: 300000, // 5 minute timeout
        }
      );

      // Wait for analysis to complete on server
      await this.waitForAnalysisCompletion(projectKey);

      // Fetch metrics from SonarQube API
      const metrics = await this.fetchMetrics(projectKey);

      return {
        ...metrics,
        sonarProjectKey: projectKey,
        analysisSuccess: true,
        analysisErrors: null,
      };
    } catch (error) {
      console.error("SonarQube analysis failed:", error);
      return this.createFailedMetrics(projectKey, (error as Error).message);
    }
  }

  private async ensureScannerContainer() {
    try {
      // Ensure repos directory exists for volume mount
      if (!fs.existsSync("./repos")) {
        fs.mkdirSync("./repos", { recursive: true });
        console.log("📁 Created repos directory for Docker volume mount");
      }

      // Check if scanner container exists and is running
      const { stdout } = await execAsync(
        "docker ps --filter name=sonar-scanner --filter status=running --format '{{.Names}}'"
      );

      if (!stdout.includes("sonar-scanner")) {
        console.log("🚀 Starting SonarQube scanner container...");
        try {
          await execAsync("docker-compose up -d sonar-scanner", {
            timeout: 30000,
          });

          // Wait a moment for container to be ready
          await new Promise((resolve) => setTimeout(resolve, 3000));
          console.log("✅ Scanner container started successfully");
        } catch (composeError) {
          console.error(
            "❌ Failed to start scanner with docker-compose, trying direct docker run..."
          );

          // Fallback: try to run scanner container directly
          await execAsync(
            `docker run -d --name sonar-scanner --network master-thesis_default -v ${process.cwd()}/repos:/usr/src sonarsource/sonar-scanner-cli:latest tail -f /dev/null`,
            { timeout: 30000 }
          );
          console.log("✅ Scanner container started with direct docker run");
        }
      } else {
        console.log("✅ Scanner container already running");
      }
    } catch (error) {
      console.error("❌ Failed to start scanner container:", error);
      console.log("💡 Try running: docker-compose up -d sonar-scanner");
      throw new Error("SonarQube scanner container not available");
    }
  }

  private async createSonarProperties(projectKey: string) {
    const sonarProps = `
sonar.projectKey=${projectKey}
sonar.projectName=${projectKey}
sonar.projectVersion=1.0
sonar.sources=.
sonar.host.url=http://sonarqube:9000
sonar.token=${SONAR_TOKEN}

# Exclusions for common non-source directories
sonar.exclusions=**/node_modules/**,**/vendor/**,**/target/**,**/build/**,**/.git/**,**/dist/**,**/coverage/**,**/test/**,**/tests/**,**/__tests__/**,**/*.test.*,**/*.spec.*

# Coverage exclusions
sonar.coverage.exclusions=**/*test*/**,**/*Test*/**,**/*spec*/**,**/*mock*/**,**/*Mock*/**

# Language-specific configurations
sonar.javascript.lcov.reportPaths=coverage/lcov.info
sonar.python.coverage.reportPaths=coverage.xml
sonar.go.coverage.reportPaths=coverage.out
sonar.java.binaries=target/classes,build/classes

# Analysis timeout
sonar.scanner.socketTimeout=300
sonar.scanner.responseTimeout=300
    `.trim();

    fs.writeFileSync(
      path.join(this.repoPath, "sonar-project.properties"),
      sonarProps
    );
  }

  private async waitForAnalysisCompletion(
    projectKey: string,
    maxWaitTime: number = 120000
  ) {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const response = await fetch(
          `${SONAR_URL}/api/ce/component?component=${projectKey}`,
          {
            headers: {
              Authorization: `Bearer ${SONAR_TOKEN}`,
            },
          }
        );

        if (response.ok) {
          const data = (await response.json()) as any;
          if (data.queue.length === 0) {
            // No pending tasks, analysis is complete
            return;
          }
        }

        // Wait 2 seconds before checking again
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.warn("Error checking analysis status:", error);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    console.warn(
      `Analysis may still be running for ${projectKey}, proceeding anyway...`
    );
  }

  private async fetchMetrics(
    projectKey: string
  ): Promise<
    Omit<SonarMetrics, "sonarProjectKey" | "analysisSuccess" | "analysisErrors">
  > {
    const metricsToFetch = [
      "ncloc",
      "sqale_index",
      "sqale_rating",
      "sqale_debt_ratio",
      "code_smells",
      "bugs",
      "vulnerabilities",
      "security_hotspots",
      "duplicated_lines_density",
      "complexity",
      "cognitive_complexity",
      "coverage",
      "line_coverage",
      "reliability_rating",
      "security_rating",
      "alert_status",
    ];

    const metricsUrl = `${SONAR_URL}/api/measures/component?component=${projectKey}&metricKeys=${metricsToFetch.join(
      ","
    )}`;

    const response = await fetch(metricsUrl, {
      headers: {
        Authorization: `Bearer ${SONAR_TOKEN}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `SonarQube API error: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as any;

    // Parse metrics
    const metrics: any = {};
    if (data.component && data.component.measures) {
      data.component.measures.forEach((measure: any) => {
        metrics[measure.metric] = measure.value;
      });
    }

    // Convert to proper types with defaults
    const ncloc = parseInt(metrics.ncloc || "0");
    const sqaleIndex = parseInt(metrics.sqale_index || "0");

    // Calculate derived metrics
    const tdDensity = ncloc > 0 ? sqaleIndex / 60 / (ncloc / 1000) : 0;

    // Simple quality score calculation (0-100)
    const qualityScore = Math.max(
      0,
      100 -
        parseInt(metrics.code_smells || "0") * 0.1 -
        parseInt(metrics.bugs || "0") * 2 -
        parseInt(metrics.vulnerabilities || "0") * 5 -
        parseFloat(metrics.duplicated_lines_density || "0") * 0.5
    );

    return {
      ncloc,
      sqaleIndex,
      sqaleRating: metrics.sqale_rating || null,
      sqaleDebtRatio: parseFloat(metrics.sqale_debt_ratio || "0"),
      codeSmells: parseInt(metrics.code_smells || "0"),
      bugs: parseInt(metrics.bugs || "0"),
      vulnerabilities: parseInt(metrics.vulnerabilities || "0"),
      securityHotspots: parseInt(metrics.security_hotspots || "0"),
      duplicatedLinesDensity: parseFloat(
        metrics.duplicated_lines_density || "0"
      ),
      complexity: parseInt(metrics.complexity || "0"),
      cognitiveComplexity: parseInt(metrics.cognitive_complexity || "0"),
      coverage: parseFloat(metrics.coverage || "0"),
      lineCoverage: parseFloat(metrics.line_coverage || "0"),
      reliabilityRating: metrics.reliability_rating || null,
      securityRating: metrics.security_rating || null,
      maintainabilityRating: metrics.sqale_rating || null,
      alertStatus: metrics.alert_status || null,
      tdDensity,
      qualityScore,
    };
  }

  private createFailedMetrics(
    projectKey: string,
    errorMessage: string
  ): SonarMetrics {
    return {
      ncloc: 0,
      sqaleIndex: 0,
      sqaleRating: null,
      sqaleDebtRatio: 0,
      codeSmells: 0,
      bugs: 0,
      vulnerabilities: 0,
      securityHotspots: 0,
      duplicatedLinesDensity: 0,
      complexity: 0,
      cognitiveComplexity: 0,
      coverage: 0,
      lineCoverage: 0,
      reliabilityRating: null,
      securityRating: null,
      maintainabilityRating: null,
      alertStatus: null,
      tdDensity: 0,
      qualityScore: 0,
      sonarProjectKey: projectKey,
      analysisSuccess: false,
      analysisErrors: JSON.stringify([errorMessage]),
    };
  }
}
