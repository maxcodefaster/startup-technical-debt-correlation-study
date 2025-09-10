import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const REPOS_DIR = "./repos";

export interface RepoInfo {
  totalFiles: number;
  repoSizeMB: number;
  commitCount: number;
  firstCommitDate: string | null;
  lastCommitDate: string | null;
}

export interface DevelopmentVelocityMetrics {
  periodDays: number;

  // Basic metrics
  commitCount: number;
  authorCount: number;
  linesAdded: number;
  linesDeleted: number;
  linesChanged: number; // additions + deletions

  // Velocity metrics
  commitVelocity: number; // commits per day
  authorActivity: number; // authors per day (team activity indicator)
  codeChurn: number; // lines changed per day

  // Composite development speed (weighted combination)
  compositeVelocity: number;
}

export class GitHandler {
  private repoPath: string;

  constructor(
    private companyName: string,
    private autoCleanup: boolean = false
  ) {
    this.repoPath = "";
  }

  async cloneRepo(githubUrl: string): Promise<string> {
    const repoName =
      githubUrl.split("/").pop()?.replace(".git", "") || this.companyName;
    this.repoPath = path.join(REPOS_DIR, repoName);

    if (!fs.existsSync(REPOS_DIR)) {
      fs.mkdirSync(REPOS_DIR, { recursive: true });
    }

    if (fs.existsSync(this.repoPath)) {
      try {
        await execAsync("git status", { cwd: this.repoPath });
        await execAsync("git fetch --all", { cwd: this.repoPath });
        await execAsync("git reset --hard", { cwd: this.repoPath });
        await execAsync("git clean -fd", { cwd: this.repoPath });
        return this.repoPath;
      } catch (error) {
        fs.rmSync(this.repoPath, { recursive: true, force: true });
      }
    }

    await execAsync(`git clone ${githubUrl} ${this.repoPath}`);
    return this.repoPath;
  }

  async checkoutDate(date: string): Promise<string | null> {
    try {
      // Go back to main/master branch first
      try {
        await execAsync(`git checkout main`, { cwd: this.repoPath });
      } catch {
        try {
          await execAsync(`git checkout master`, { cwd: this.repoPath });
        } catch {
          // Continue if neither exists
        }
      }

      // Get commit before or on the date
      let { stdout } = await execAsync(
        `git log --until="${date}T23:59:59" --format="%H" -1 --all`,
        { cwd: this.repoPath }
      );

      let commitHash = stdout.trim();

      if (!commitHash) {
        try {
          const { stdout: afterStdout } = await execAsync(
            `git log --since="${date}T00:00:00" --format="%H" --reverse --all | head -1`,
            { cwd: this.repoPath }
          );
          commitHash = afterStdout.trim();
        } catch {
          const { stdout: firstStdout } = await execAsync(
            `git log --format="%H" --reverse --all | head -1`,
            { cwd: this.repoPath }
          );
          commitHash = firstStdout.trim();
        }
      }

      if (!commitHash) {
        throw new Error(`Repository appears to be empty`);
      }

      // Clean state and checkout
      await execAsync(`git reset --hard`, { cwd: this.repoPath });
      await execAsync(`git clean -fd`, { cwd: this.repoPath });
      await execAsync(`git checkout ${commitHash}`, { cwd: this.repoPath });

      return commitHash;
    } catch (error) {
      return null;
    }
  }

  async analyzeRepository(): Promise<RepoInfo> {
    let totalFiles = 0;
    let repoSizeMB = 0;
    let commitCount = 0;
    let firstCommitDate: string | null = null;
    let lastCommitDate: string | null = null;

    try {
      const { stdout: fileCount } = await execAsync(`find . -type f | wc -l`, {
        cwd: this.repoPath,
      });
      totalFiles = parseInt(fileCount.trim());

      const { stdout: size } = await execAsync(`du -sm .`, {
        cwd: this.repoPath,
      });
      repoSizeMB = parseInt(size.split("\t")[0]!);

      const { stdout: commits } = await execAsync(`git rev-list --count HEAD`, {
        cwd: this.repoPath,
      });
      commitCount = parseInt(commits.trim());

      const { stdout: firstCommit } = await execAsync(
        `git log --reverse --format="%ai" | head -1`,
        { cwd: this.repoPath }
      );
      firstCommitDate = firstCommit.trim().split(" ")[0] || null;

      const { stdout: lastCommit } = await execAsync(
        `git log -1 --format="%ai"`,
        { cwd: this.repoPath }
      );
      lastCommitDate = lastCommit.trim().split(" ")[0] || null;
    } catch (error) {
      // Silent fallback
    }

    return {
      totalFiles,
      repoSizeMB,
      commitCount,
      firstCommitDate,
      lastCommitDate,
    };
  }

  /**
   * Calculates development velocity metrics for a given time period.
   * This composite metric is designed to model the internal execution speed of a startup,
   * prioritizing code output and team activity, which differs from metrics like CNCF's that https://github.com/cncf/velocity/blob/main/README.md
   * focus on broader open-source community health (e.g., issues, PRs).
   * @param startDate - The start date of the period.
   * @param endDate - The end date of the period.
   * @returns A promise resolving to DevelopmentVelocityMetrics.
   */
  async calculateDevelopmentVelocity(
    startDate: string,
    endDate: string
  ): Promise<DevelopmentVelocityMetrics> {
    try {
      // Calculate period length in days
      const start = new Date(startDate);
      const end = new Date(endDate);
      const periodDays = Math.max(
        1,
        Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      );

      // Get commit count in period
      const { stdout: commitOutput } = await execAsync(
        `git rev-list --count --since="${startDate}T00:00:00" --until="${endDate}T23:59:59" --all`,
        { cwd: this.repoPath }
      );
      const commitCount = parseInt(commitOutput.trim()) || 0;

      // Get unique author count in period
      const { stdout: authorOutput } = await execAsync(
        `git log --format="%ae" --since="${startDate}T00:00:00" --until="${endDate}T23:59:59" --all | sort | uniq | wc -l`,
        { cwd: this.repoPath }
      );
      const authorCount = parseInt(authorOutput.trim()) || 0;

      // Get line changes (additions and deletions) using git log --stat
      let linesAdded = 0;
      let linesDeleted = 0;

      try {
        const { stdout: statsOutput } = await execAsync(
          `git log --since="${startDate}T00:00:00" --until="${endDate}T23:59:59" --stat --format="" --all`,
          { cwd: this.repoPath }
        );

        // Parse git stat output to count insertions and deletions
        const statLines = statsOutput.split("\n");
        for (const line of statLines) {
          const insertionsMatch = line.match(/(\d+) insertions?\(\+\)/);
          const deletionsMatch = line.match(/(\d+) deletions?\(-\)/);

          if (insertionsMatch?.[1]) {
            linesAdded += parseInt(insertionsMatch[1]);
          }
          if (deletionsMatch?.[1]) {
            linesDeleted += parseInt(deletionsMatch[1]);
          }
        }
      } catch (error) {
        // Fallback: estimate based on commits (rough heuristic)
        linesAdded = Math.max(0, commitCount * 20); // ~20 lines per commit average
        linesDeleted = Math.max(0, commitCount * 5); // ~5 deletions per commit average
      }

      const linesChanged = linesAdded + linesDeleted;

      // Calculate time-normalized velocity metrics
      const commitVelocity = commitCount / periodDays;
      const authorActivity = authorCount / periodDays;
      const codeChurn = linesChanged / periodDays;

      // --- Composite Velocity Model Rationale ---
      // This model creates a single velocity score. It's a heuristic designed to balance
      // three key aspects of development speed in a startup context.
      // 1. Code Churn: The primary measure of raw output. Weighted highest.
      // 2. Commit Velocity: A proxy for iteration frequency and agile practices.
      // 3. Author Activity: Represents team breadth and engagement.
      const WEIGHT_CHURN = 0.4; // Weight for code output
      const WEIGHT_COMMITS = 0.35; // Weight for iteration frequency
      const WEIGHT_AUTHORS = 0.25; // Weight for team engagement

      // Scaling factors are used to bring the different metrics to a comparable order of magnitude.
      const SCALE_COMMITS = 50;
      const SCALE_AUTHORS = 100;

      const compositeVelocity =
        codeChurn * WEIGHT_CHURN +
        commitVelocity * SCALE_COMMITS * WEIGHT_COMMITS +
        authorActivity * SCALE_AUTHORS * WEIGHT_AUTHORS;

      return {
        periodDays,
        commitCount,
        authorCount,
        linesAdded,
        linesDeleted,
        linesChanged,
        commitVelocity,
        authorActivity,
        codeChurn,
        compositeVelocity,
      };
    } catch (error) {
      // Return fallback metrics
      const periodDays = Math.max(
        1,
        Math.ceil(
          (new Date(endDate).getTime() - new Date(startDate).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      );
      return {
        periodDays,
        commitCount: 0,
        authorCount: 0,
        linesAdded: 0,
        linesDeleted: 0,
        linesChanged: 0,
        commitVelocity: 0,
        authorActivity: 0,
        codeChurn: 0,
        compositeVelocity: 0,
      };
    }
  }

  cleanup() {
    if (this.autoCleanup && this.repoPath && fs.existsSync(this.repoPath)) {
      fs.rmSync(this.repoPath, { recursive: true, force: true });
    }
  }

  getRepoPath(): string {
    return this.repoPath;
  }

  static cleanAllRepos() {
    if (fs.existsSync(REPOS_DIR)) {
      fs.rmSync(REPOS_DIR, { recursive: true, force: true });
    }
  }

  static listExistingRepos(): string[] {
    if (!fs.existsSync(REPOS_DIR)) {
      return [];
    }
    return fs
      .readdirSync(REPOS_DIR, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);
  }
}
