import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Configuration
const SONAR_URL = "http://localhost:9000";
const SONAR_TOKEN = "squ_d0f7a14ca8c269fb5e81f10d1791ff5e4c81285c"; // Update this with your actual token
const SONAR_SCANNER_PATH = "sonar-scanner"; // Assumes sonar-scanner is in PATH

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
      // Create sonar-project.properties
      await this.createSonarProperties(projectKey);

      // Run SonarQube analysis
      console.log(`Running SonarQube analysis for ${projectKey}...`);
      await execAsync(`${SONAR_SCANNER_PATH}`, {
        cwd: this.repoPath,
        timeout: 300000, // 5 minute timeout
      });

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

  private async createSonarProperties(projectKey: string) {
    const sonarProps = `
sonar.projectKey=${projectKey}
sonar.projectName=${projectKey}
sonar.projectVersion=1.0
sonar.sources=.
sonar.host.url=${SONAR_URL}
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
