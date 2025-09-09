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
  roundType: text("round_type").notNull(),
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

  // Core Metrics from Qlty metrics.txt (keep original)
  linesOfCode: integer("lines_of_code"),
  totalLines: integer("total_lines"),
  complexity: integer("complexity"),
  cognitiveComplexity: integer("cognitive_complexity"),
  totalFunctions: integer("total_functions"),
  totalClasses: integer("total_classes"),
  totalFields: integer("total_fields"),
  lackOfCohesion: integer("lack_of_cohesion"),

  // Code Smells (keep original)
  totalIssues: integer("total_issues"),
  totalEffortMinutes: integer("total_effort_minutes"),
  averageEffortPerIssue: real("average_effort_per_issue"),
  issuesByCategory: text("issues_by_category"),
  issuesByLevel: text("issues_by_level"),
  issuesByLanguage: text("issues_by_language"),
  highComplexityFunctions: integer("high_complexity_functions"),
  highComplexityFiles: integer("high_complexity_files"),
  manyParameterFunctions: integer("many_parameter_functions"),
  complexBooleanLogic: integer("complex_boolean_logic"),
  deeplyNestedCode: integer("deeply_nested_code"),
  manyReturnStatements: integer("many_return_statements"),

  // Derived Quality Metrics (keep original)
  totalCodeSmells: integer("total_code_smells"),
  averageComplexity: real("average_complexity"),
  maxComplexity: integer("max_complexity"),
  complexityDensity: real("complexity_density"),
  issuesDensity: real("issues_density"),
  technicalDebtMinutes: real("technical_debt_minutes"),
  technicalDebtRatio: real("technical_debt_ratio"),

  // Analysis metadata (keep original)
  analysisSuccess: integer("analysis_success", { mode: "boolean" }).default(
    true
  ),
  analysisErrors: text("analysis_errors"),
  qltyVersion: text("qlty_version"),
  analysisDate: text("analysis_date").default(sql`CURRENT_TIMESTAMP`),
});

// NEW: Simple table for TDV calculation between rounds
export const developmentVelocity = sqliteTable("development_velocity", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id),
  fromRoundId: integer("from_round_id").references(() => fundingRounds.id),
  toRoundId: integer("to_round_id").references(() => fundingRounds.id),

  periodDays: integer("period_days").notNull(),
  linesAdded: integer("lines_added"),
  developmentSpeed: real("development_speed"), // lines_added / period_days

  startTDR: real("start_tdr"),
  endTDR: real("end_tdr"),
  tdrChange: real("tdr_change"), // (end - start) / start

  tdv: real("tdv"), // tdrChange / developmentSpeed
  gotNextRound: integer("got_next_round", { mode: "boolean" }),

  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// Type exports
export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
export type FundingRound = typeof fundingRounds.$inferSelect;
export type NewFundingRound = typeof fundingRounds.$inferInsert;
export type RepositoryInfo = typeof repositoryInfo.$inferSelect;
export type NewRepositoryInfo = typeof repositoryInfo.$inferInsert;
export type CodeSnapshot = typeof codeSnapshots.$inferSelect;
export type NewCodeSnapshot = typeof codeSnapshots.$inferInsert;
export type DevelopmentVelocity = typeof developmentVelocity.$inferSelect;
export type NewDevelopmentVelocity = typeof developmentVelocity.$inferInsert;
