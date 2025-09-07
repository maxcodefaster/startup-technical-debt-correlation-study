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

    // Ensure repos directory exists
    if (!fs.existsSync(REPOS_DIR)) {
      fs.mkdirSync(REPOS_DIR, { recursive: true });
    }

    // Check if repo already exists
    if (fs.existsSync(this.repoPath)) {
      try {
        await execAsync("git status", { cwd: this.repoPath });
        // Fetch latest changes and reset to clean state
        await execAsync("git fetch --all", { cwd: this.repoPath });
        await execAsync("git reset --hard", { cwd: this.repoPath });
        await execAsync("git clean -fd", { cwd: this.repoPath });
        return this.repoPath;
      } catch (error) {
        // Remove corrupted repo and re-clone
        fs.rmSync(this.repoPath, { recursive: true, force: true });
      }
    }

    // Clone fresh repo
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
          // Continue if neither main nor master exist
        }
      }

      // Get commit before or on the date
      let { stdout } = await execAsync(
        `git log --until="${date}T23:59:59" --format="%H" -1 --all`,
        { cwd: this.repoPath }
      );

      let commitHash = stdout.trim();
      let strategy = "before_or_on";

      // If no commits found before the date, try first commit after
      if (!commitHash) {
        try {
          const { stdout: afterStdout } = await execAsync(
            `git log --since="${date}T00:00:00" --format="%H" --reverse --all | head -1`,
            { cwd: this.repoPath }
          );
          commitHash = afterStdout.trim();
          strategy = "first_after";
        } catch {
          // Use the very first commit in the repo
          const { stdout: firstStdout } = await execAsync(
            `git log --format="%H" --reverse --all | head -1`,
            { cwd: this.repoPath }
          );
          commitHash = firstStdout.trim();
          strategy = "first_ever";
        }
      }

      if (!commitHash) {
        throw new Error(`Repository appears to be empty`);
      }

      // Get commit info for logging
      const { stdout: commitInfo } = await execAsync(
        `git log --format="%H %ai" -1 ${commitHash}`,
        { cwd: this.repoPath }
      );

      console.log(
        `    📍 Using commit (${strategy}): ${commitInfo
          .trim()
          .substring(0, 80)}...`
      );

      // Clean state and checkout to the specific commit
      await execAsync(`git reset --hard`, { cwd: this.repoPath });
      await execAsync(`git clean -fd`, { cwd: this.repoPath });
      await execAsync(`git checkout ${commitHash}`, { cwd: this.repoPath });

      return commitHash;
    } catch (error) {
      console.error(
        `    ❌ Failed to checkout date ${date}:`,
        (error as Error).message
      );
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
      // Basic repo stats
      const { stdout: fileCount } = await execAsync(`find . -type f | wc -l`, {
        cwd: this.repoPath,
      });
      totalFiles = parseInt(fileCount.trim());

      const { stdout: size } = await execAsync(`du -sm .`, {
        cwd: this.repoPath,
      });
      repoSizeMB = parseInt(size.split("\t")[0]!);

      // Commit info
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
      console.error("Repository analysis failed:", error);
    }

    return {
      totalFiles,
      repoSizeMB,
      commitCount,
      firstCommitDate,
      lastCommitDate,
    };
  }

  cleanup() {
    if (this.autoCleanup && this.repoPath && fs.existsSync(this.repoPath)) {
      fs.rmSync(this.repoPath, { recursive: true, force: true });
    }
  }

  getRepoPath(): string {
    return this.repoPath;
  }

  // Static method to clean all repos if needed
  static cleanAllRepos() {
    if (fs.existsSync(REPOS_DIR)) {
      fs.rmSync(REPOS_DIR, { recursive: true, force: true });
    }
  }

  // Static method to list existing repos
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
