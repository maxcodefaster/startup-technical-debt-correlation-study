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
  totalFiles: integer("total_files"),
  repoSizeMB: real("repo_size_mb"),
  commitCount: integer("commit_count"),
  firstCommitDate: text("first_commit_date"),
  lastCommitDate: text("last_commit_date"),

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

  // Core Metrics from Qlty metrics.txt
  linesOfCode: integer("lines_of_code"), // LOC column
  totalLines: integer("total_lines"), // lines column (includes comments/whitespace)
  complexity: integer("complexity"), // cyclo column
  cognitiveComplexity: integer("cognitive_complexity"), // complex column
  totalFunctions: integer("total_functions"), // funcs column
  totalClasses: integer("total_classes"), // classes column
  totalFields: integer("total_fields"), // fields column
  lackOfCohesion: integer("lack_of_cohesion"), // LCOM column

  // Code Smells Aggregations from smells.json
  totalIssues: integer("total_issues"),
  totalEffortMinutes: integer("total_effort_minutes"), // Sum of all effortMinutes
  averageEffortPerIssue: real("average_effort_per_issue"),

  // Issues by category (JSON: {CATEGORY_DUPLICATION: count, CATEGORY_STRUCTURE: count})
  issuesByCategory: text("issues_by_category"),

  // Issues by level (JSON: {LEVEL_HIGH: count, LEVEL_MEDIUM: count, LEVEL_LOW: count})
  issuesByLevel: text("issues_by_level"),

  // Issues by language (JSON: {LANGUAGE_PYTHON: count, LANGUAGE_JAVA: count, ...})
  issuesByLanguage: text("issues_by_language"),

  highComplexityFunctions: integer("high_complexity_functions"),
  highComplexityFiles: integer("high_complexity_files"),
  manyParameterFunctions: integer("many_parameter_functions"),
  complexBooleanLogic: integer("complex_boolean_logic"),
  deeplyNestedCode: integer("deeply_nested_code"),
  manyReturnStatements: integer("many_return_statements"),

  // Derived Quality Metrics for Technical Debt Calculation
  totalCodeSmells: integer("total_code_smells"),
  averageComplexity: real("average_complexity"),
  maxComplexity: integer("max_complexity"),
  complexityDensity: real("complexity_density"), // complexity per 1000 LOC
  issuesDensity: real("issues_density"), // issues per 1000 LOC
  technicalDebtMinutes: real("technical_debt_minutes"), // totalEffortMinutes
  technicalDebtRatio: real("technical_debt_ratio"), // effort minutes / development hours estimate

  // Analysis metadata
  analysisSuccess: integer("analysis_success", { mode: "boolean" }).default(
    true
  ),
  analysisErrors: text("analysis_errors"),
  qltyVersion: text("qlty_version"),
  analysisDate: text("analysis_date").default(sql`CURRENT_TIMESTAMP`),
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
