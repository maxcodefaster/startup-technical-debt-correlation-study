import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const REPOS_DIR = "./repos";

export interface RepoInfo {
  detectedLanguages: string[];
  primaryLanguage: string;
  totalFiles: number;
  repoSizeMB: number;
  commitCount: number;
  firstCommitDate: string | null;
  lastCommitDate: string | null;
  frameworks: {
    hasPackageJson: boolean;
    hasPomXml: boolean;
    hasCargoToml: boolean;
    hasGoMod: boolean;
    hasRequirementsTxt: boolean;
    hasGemfile: boolean;
    hasComposerJson: boolean;
  };
  detectedFrameworks: string[];
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
      console.log(`📁 Repo already exists, reusing: ${this.repoPath}`);

      // Verify it's a valid git repo
      try {
        await execAsync("git status", { cwd: this.repoPath });

        // Fetch latest changes to ensure we have all commits
        console.log("🔄 Fetching latest changes...");
        await execAsync("git fetch --all", { cwd: this.repoPath });

        // Reset to clean state (in case previous analysis left uncommitted changes)
        await execAsync("git reset --hard", { cwd: this.repoPath });
        await execAsync("git clean -fd", { cwd: this.repoPath });

        return this.repoPath;
      } catch (error) {
        console.log(`⚠️ Existing repo seems corrupted, re-cloning...`);
        fs.rmSync(this.repoPath, { recursive: true, force: true });
      }
    }

    // Clone fresh repo
    console.log(`📥 Cloning ${githubUrl}...`);
    await execAsync(`git clone ${githubUrl} ${this.repoPath}`);
    console.log(`✅ Cloned to: ${this.repoPath}`);

    return this.repoPath;
  }

  async checkoutDate(date: string): Promise<string | null> {
    try {
      // Always go back to main/master branch first to see all commits
      try {
        await execAsync(`git checkout main`, { cwd: this.repoPath });
      } catch {
        try {
          await execAsync(`git checkout master`, { cwd: this.repoPath });
        } catch {
          // If neither main nor master exist, just continue
        }
      }

      // Debug: Show commits around the target date
      console.log(`🔍 Looking for commits around ${date}...`);
      try {
        const { stdout: debugCommits } = await execAsync(
          `git log --since="${date} -30 days" --until="${date} +30 days" --oneline --date=short | head -5`,
          { cwd: this.repoPath }
        );
        if (debugCommits.trim()) {
          console.log(
            `   Nearby commits: ${debugCommits.trim().split("\n")[0]}`
          );
        }
      } catch {
        // Ignore debug errors
      }

      // First, try to get commit before or on the date (with explicit date format)
      let { stdout } = await execAsync(
        `git log --until="${date}T23:59:59" --format="%H" -1 --all`,
        { cwd: this.repoPath }
      );

      let commitHash = stdout.trim();
      let strategy = "before_or_on";

      // If no commits found before the date, try to get the first commit after
      if (!commitHash) {
        console.log(
          `No commits found before ${date}, trying first commit after...`
        );

        try {
          const { stdout: afterStdout } = await execAsync(
            `git log --since="${date}T00:00:00" --format="%H" --reverse --all | head -1`,
            { cwd: this.repoPath }
          );
          commitHash = afterStdout.trim();
          strategy = "first_after";
        } catch {
          // If that fails too, get the very first commit in the repo
          console.log(
            `No commits found after ${date}, using first commit in repo...`
          );
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
        `git log --format="%H %ai %s" -1 ${commitHash}`,
        { cwd: this.repoPath }
      );

      console.log(`📍 Using commit (${strategy}): ${commitInfo.trim()}`);

      // Clean any existing state before checkout
      await execAsync(`git reset --hard`, { cwd: this.repoPath });
      await execAsync(`git clean -fd`, { cwd: this.repoPath });

      // Checkout to the specific commit
      await execAsync(`git checkout ${commitHash}`, { cwd: this.repoPath });

      return commitHash;
    } catch (error) {
      console.error(
        `Failed to checkout date ${date}:`,
        (error as Error).message
      );
      return null;
    }
  }

  async analyzeRepository(): Promise<RepoInfo> {
    const detectedLanguages: string[] = [];
    const frameworks: RepoInfo["frameworks"] = {
      hasPackageJson: false,
      hasPomXml: false,
      hasCargoToml: false,
      hasGoMod: false,
      hasRequirementsTxt: false,
      hasGemfile: false,
      hasComposerJson: false,
    };
    const detectedFrameworks: string[] = [];

    let primaryLanguage = "";
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
      try {
        const { stdout: commits } = await execAsync(
          `git rev-list --count HEAD`,
          { cwd: this.repoPath }
        );
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
        console.warn("Failed to get commit info:", error);
      }

      // Detect languages by file extensions
      const languagePatterns = [
        { pattern: "*.js", language: "javascript" },
        { pattern: "*.ts", language: "typescript" },
        { pattern: "*.py", language: "python" },
        { pattern: "*.java", language: "java" },
        { pattern: "*.go", language: "go" },
        { pattern: "*.rs", language: "rust" },
        { pattern: "*.php", language: "php" },
        { pattern: "*.rb", language: "ruby" },
        { pattern: "*.cpp", language: "cpp" },
        { pattern: "*.c", language: "c" },
        { pattern: "*.cs", language: "csharp" },
        { pattern: "*.kt", language: "kotlin" },
        { pattern: "*.swift", language: "swift" },
      ];

      for (const { pattern, language } of languagePatterns) {
        try {
          const { stdout } = await execAsync(
            `find . -name "${pattern}" | head -1`,
            { cwd: this.repoPath }
          );
          if (stdout.trim()) {
            detectedLanguages.push(language);
          }
        } catch {
          // Ignore errors for individual language detection
        }
      }

      primaryLanguage = detectedLanguages[0] || "unknown";

      // Detect frameworks and build systems
      const frameworkFiles = [
        { file: "package.json", key: "hasPackageJson", framework: "nodejs" },
        { file: "pom.xml", key: "hasPomXml", framework: "maven" },
        { file: "Cargo.toml", key: "hasCargoToml", framework: "rust" },
        { file: "go.mod", key: "hasGoMod", framework: "go" },
        {
          file: "requirements.txt",
          key: "hasRequirementsTxt",
          framework: "python",
        },
        { file: "Gemfile", key: "hasGemfile", framework: "ruby" },
        { file: "composer.json", key: "hasComposerJson", framework: "php" },
      ];

      for (const check of frameworkFiles) {
        if (fs.existsSync(path.join(this.repoPath, check.file))) {
          (frameworks as any)[check.key] = true;
          detectedFrameworks.push(check.framework);
        }
      }
    } catch (error) {
      console.error("Repository analysis failed:", error);
    }

    return {
      detectedLanguages,
      primaryLanguage,
      totalFiles,
      repoSizeMB,
      commitCount,
      firstCommitDate,
      lastCommitDate,
      frameworks,
      detectedFrameworks,
    };
  }

  cleanup() {
    if (this.autoCleanup && this.repoPath && fs.existsSync(this.repoPath)) {
      console.log(`🗑️ Cleaning up repo: ${this.repoPath}`);
      fs.rmSync(this.repoPath, { recursive: true, force: true });
    } else if (this.repoPath) {
      console.log(`📁 Keeping repo for inspection: ${this.repoPath}`);
    }
  }

  getRepoPath(): string {
    return this.repoPath;
  }

  // Static method to clean all repos if needed
  static cleanAllRepos() {
    if (fs.existsSync(REPOS_DIR)) {
      console.log(`🗑️ Cleaning all repos in ${REPOS_DIR}`);
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
