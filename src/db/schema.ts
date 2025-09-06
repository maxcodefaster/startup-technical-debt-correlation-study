import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const companies = sqliteTable("companies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  githubLink: text("github_link").notNull(),
  exitState: text("exit_state").default("none"),
  exitDate: text("exit_date"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const fundingRounds = sqliteTable("funding_rounds", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id),
  roundType: text("round_type").notNull(), // 'seed', 'series_a', etc.
  roundDate: text("round_date").notNull(),
  amountUsd: real("amount_usd"),
  isExtension: integer("is_extension", { mode: "boolean" }).default(false),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const repositoryInfo = sqliteTable("repository_info", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id),
  analysisDate: text("analysis_date").notNull(),

  // Repository characteristics
  detectedLanguages: text("detected_languages"), // JSON array of languages
  primaryLanguage: text("primary_language"),
  totalFiles: integer("total_files"),
  repoSizeMB: real("repo_size_mb"),
  commitCount: integer("commit_count"),
  firstCommitDate: text("first_commit_date"),
  lastCommitDate: text("last_commit_date"),

  // Build/Framework detection
  hasPackageJson: integer("has_package_json", { mode: "boolean" }).default(
    false
  ),
  hasPomXml: integer("has_pom_xml", { mode: "boolean" }).default(false),
  hasCargoToml: integer("has_cargo_toml", { mode: "boolean" }).default(false),
  hasGoMod: integer("has_go_mod", { mode: "boolean" }).default(false),
  hasRequirementsTxt: integer("has_requirements_txt", {
    mode: "boolean",
  }).default(false),
  hasGemfile: integer("has_gemfile", { mode: "boolean" }).default(false),
  hasComposerJson: integer("has_composer_json", { mode: "boolean" }).default(
    false
  ),

  // Framework indicators
  detectedFrameworks: text("detected_frameworks"), // JSON array

  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const codeSnapshots = sqliteTable("code_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id),
  fundingRoundId: integer("funding_round_id").references(
    () => fundingRounds.id
  ),
  repositoryInfoId: integer("repository_info_id").references(
    () => repositoryInfo.id
  ),
  snapshotDate: text("snapshot_date").notNull(),
  commitHash: text("commit_hash").notNull(),

  // Core Technical Debt Metrics (SonarQube Community Edition)
  ncloc: integer("ncloc"), // Lines of code
  sqaleIndex: integer("sqale_index"), // Technical debt in minutes
  sqaleRating: text("sqale_rating"), // Maintainability rating A-E
  sqaleDebtRatio: real("sqale_debt_ratio"), // Technical debt ratio %

  // Quality Issues
  codeSmells: integer("code_smells"),
  bugs: integer("bugs"),
  vulnerabilities: integer("vulnerabilities"),
  securityHotspots: integer("security_hotspots"),

  // Code Structure
  duplicatedLinesDensity: real("duplicated_lines_density"),
  complexity: integer("complexity"),
  cognitiveComplexity: integer("cognitive_complexity"),

  // Test Coverage (if available)
  coverage: real("coverage"),
  lineCoverage: real("line_coverage"),

  // Quality Ratings
  reliabilityRating: text("reliability_rating"),
  securityRating: text("security_rating"),
  maintainabilityRating: text("maintainability_rating"),

  // Quality Gate
  alertStatus: text("alert_status"),

  // Calculated metrics
  tdDensity: real("td_density"), // TD per 1K LOC
  qualityScore: real("quality_score"), // Composite 0-100

  // Analysis metadata
  sonarProjectKey: text("sonar_project_key"),
  analysisSuccess: integer("analysis_success", { mode: "boolean" }).default(
    true
  ),
  analysisErrors: text("analysis_errors"), // JSON array of any errors
  analysisDate: text("analysis_date").default(sql`CURRENT_TIMESTAMP`),
});

export const analysisLog = sqliteTable("analysis_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").references(() => companies.id),
  level: text("level").notNull(), // 'info', 'warning', 'error'
  stage: text("stage").notNull(), // 'clone', 'checkout', 'sonar', 'metrics'
  message: text("message").notNull(),
  details: text("details"), // JSON for additional context
  timestamp: text("timestamp").default(sql`CURRENT_TIMESTAMP`),
});

// Type exports for TypeScript
export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
export type FundingRound = typeof fundingRounds.$inferSelect;
export type NewFundingRound = typeof fundingRounds.$inferInsert;
export type RepositoryInfo = typeof repositoryInfo.$inferSelect;
export type NewRepositoryInfo = typeof repositoryInfo.$inferInsert;
export type CodeSnapshot = typeof codeSnapshots.$inferSelect;
export type NewCodeSnapshot = typeof codeSnapshots.$inferInsert;
export type AnalysisLog = typeof analysisLog.$inferSelect;
export type NewAnalysisLog = typeof analysisLog.$inferInsert;
