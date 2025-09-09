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

  // Calculate development speed between two dates for TDV
  async calculateDevelopmentSpeed(
    startDate: string,
    endDate: string
  ): Promise<{
    periodDays: number;
    linesAdded: number;
    developmentSpeed: number;
  }> {
    try {
      // Calculate period length in days
      const start = new Date(startDate);
      const end = new Date(endDate);
      const periodDays = Math.max(
        1,
        Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      );

      // Calculate line additions using git log --stat
      let linesAdded = 0;

      try {
        const { stdout: statsOutput } = await execAsync(
          `git log --since="${startDate}T00:00:00" --until="${endDate}T23:59:59" --stat --format="" --all`,
          { cwd: this.repoPath }
        );

        // Parse git stat output to count insertions
        const statLines = statsOutput.split("\n");
        for (const line of statLines) {
          const insertionsMatch = line.match(/(\d+) insertions?\(\+\)/);
          if (insertionsMatch) {
            linesAdded += parseInt(insertionsMatch[1]);
          }
        }
      } catch (error) {
        // Fallback: estimate based on period
        linesAdded = Math.max(0, periodDays * 10); // rough estimate
      }

      const developmentSpeed = linesAdded / periodDays;

      return {
        periodDays,
        linesAdded,
        developmentSpeed,
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
        linesAdded: 0,
        developmentSpeed: 0,
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
