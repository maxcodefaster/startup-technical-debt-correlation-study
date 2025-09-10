import { alias } from "drizzle-orm/sqlite-core";
import { db } from "./db/db";
import {
  companies,
  fundingRounds,
  developmentVelocity,
  codeSnapshots,
} from "./db/schema";
import { eq, and } from "drizzle-orm";
import {
  cumulativeStdNormalProbability,
  linearRegression,
} from "simple-statistics";

interface MarketCategoryAnalysis {
  category: string;
  count: number;
  avgTDR: number;
  avgVelocity: number;
  successRate: number;
}

interface EntrepreneurshipAnalysis {
  summary: {
    totalVentures: number;
    validDataPoints: number;
    filteredDataPoints: number;
    avgFundingGrowthRate: number;
    avgDaysBetweenRounds: number;
    avgTechnicalDebtRatio: number;
    avgDevelopmentVelocity: number;
    fundingSuccessRate: number;
  };

  dataQuality: {
    totalRecords: number;
    recordsWithValidTDR: number;
    recordsWithSufficientCode: number;
    recordsUsedInAnalysis: number;
    filteringReason: string;
  };

  strategicFramework: {
    lowDebtHighVelocity: {
      count: number;
      avgFundingGrowth: number;
      successRate: number;
      avgTDR: number;
      avgVelocity: number;
    };
    highDebtHighVelocity: {
      count: number;
      avgFundingGrowth: number;
      successRate: number;
      avgTDR: number;
      avgVelocity: number;
    };
    lowDebtLowVelocity: {
      count: number;
      avgFundingGrowth: number;
      successRate: number;
      avgTDR: number;
      avgVelocity: number;
    };
    highDebtLowVelocity: {
      count: number;
      avgFundingGrowth: number;
      successRate: number;
      avgTDR: number;
      avgVelocity: number;
    };
  };

  statisticalAnalysis: {
    correlation_TDR_velocity: number;
    correlation_TDR_funding: number;
    correlation_velocity_funding: number;
    correlation_TDRchange_funding: number;
    regressionSlope: number;
    rSquared: number;
    pValue: number;
    significanceLevel: string;
  };

  fundingAnalysis: {
    byTDRQuartile: Array<{
      quartile: string;
      avgTDR: number;
      avgFundingGrowth: number;
      successRate: number;
      count: number;
    }>;
    byVelocityQuartile: Array<{
      quartile: string;
      avgVelocity: number;
      avgFundingGrowth: number;
      successRate: number;
      count: number;
    }>;
    byMarketCategory: MarketCategoryAnalysis[]; // Added this line
  };

  insights: {
    primaryFinding: string;
    dataQualityNote: string;
    practicalImplication: string;
    limitations: string;
  };

  exportDate: string;
}

function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]! // It's good practice to add it here too
    : (sorted[mid - 1]! + sorted[mid]!) / 2; // Fix is here
}

function removeOutliers(values: number[]): number[] {
  if (values.length < 4) return values;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];

  if (q1 === undefined || q3 === undefined) {
    return values; // Not enough data to determine outliers
  }

  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;
  return values.filter((v) => v >= lowerBound && v <= upperBound);
}

function calculateCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n === 0 || y.length !== n) return 0;

  const meanX = x.reduce((sum, val) => sum + val, 0) / n;
  const meanY = y.reduce((sum, val) => sum + val, 0) / n;
  const numerator = x.reduce(
    (sum, val, i) => sum + (val - meanX) * (y[i]! - meanY),
    0
  );
  const denomX = Math.sqrt(
    x.reduce((sum, val) => sum + Math.pow(val - meanX, 2), 0)
  );
  const denomY = Math.sqrt(
    y.reduce((sum, val) => sum + Math.pow(val - meanY, 2), 0)
  );
  if (denomX === 0 || denomY === 0) return 0;
  return numerator / (denomX * denomY);
}

/**
 * Calculates the p-value for a given correlation coefficient and sample size.
 * This function is now statistically valid and uses a proper statistical library.
 * @param correlation - The Pearson correlation coefficient (r).
 * @param n - The sample size.
 * @returns The two-tailed p-value.
 */
function calculatePValue(correlation: number, n: number): number {
  if (n <= 2) {
    return 1.0; // P-value is not meaningful for n <= 2
  }

  // Handle perfect correlation edge case to avoid division by zero
  if (Math.abs(correlation) >= 1.0) {
    return 0.0;
  }

  // Calculate the t-statistic from the correlation coefficient
  const tStatistic =
    correlation * Math.sqrt((n - 2) / (1 - correlation * correlation));

  // If the t-statistic is not a finite number, return non-significant
  if (!isFinite(tStatistic)) {
    return 1.0;
  }

  // For n > 30, the t-distribution is well-approximated by the standard normal distribution.
  // We calculate the two-tailed p-value from the standard normal cumulative distribution function (CDF).
  // The probability of observing a value as extreme or more extreme than our t-statistic.
  const pValue = 2 * (1 - cumulativeStdNormalProbability(Math.abs(tStatistic)));

  return pValue;
}

export async function calculateEntrepreneurshipAnalysis(): Promise<EntrepreneurshipAnalysis> {
  // Create aliases for the two different joins to codeSnapshots
  const fromSnapshot = alias(codeSnapshots, "fromSnapshot");
  const toSnapshot = alias(codeSnapshots, "toSnapshot");

  // Get all velocity data with associated code snapshots
  const allVelocityData = await db
    .select({
      velocity: developmentVelocity,
      fromSnapshot: fromSnapshot,
      toSnapshot: toSnapshot,
      company: companies,
    })
    .from(developmentVelocity)
    .leftJoin(
      fromSnapshot,
      and(
        eq(fromSnapshot.companyId, developmentVelocity.companyId),
        eq(fromSnapshot.fundingRoundId, developmentVelocity.fromRoundId!)
      )
    )
    .leftJoin(
      toSnapshot,
      and(
        eq(toSnapshot.companyId, developmentVelocity.companyId),
        eq(toSnapshot.fundingRoundId, developmentVelocity.toRoundId!)
      )
    )
    .leftJoin(companies, eq(companies.id, developmentVelocity.companyId));

  const totalRecords = allVelocityData.length;

  // Data preparation with quality filtering
  const processedData = await Promise.all(
    allVelocityData.map(async (row) => {
      const velocity = row.velocity;

      // Get funding round information
      const fromRound = velocity.fromRoundId
        ? await db
            .select()
            .from(fundingRounds)
            .where(eq(fundingRounds.id, velocity.fromRoundId))
            .limit(1)
        : [null];
      const toRound = velocity.toRoundId
        ? await db
            .select()
            .from(fundingRounds)
            .where(eq(fundingRounds.id, velocity.toRoundId))
            .limit(1)
        : [null];

      const fromAmount = fromRound[0]?.amountUsd || 0;
      const toAmount = toRound[0]?.amountUsd || 0;
      const fundingGrowthRate =
        fromAmount > 0 ? ((toAmount - fromAmount) / fromAmount) * 100 : 0;

      // Get snapshot LOC for quality filtering
      const fromLOC = row.fromSnapshot?.linesOfCode || 0;
      const toLOC = row.toSnapshot?.linesOfCode || 0;

      return {
        ...velocity,
        marketCategory: row.company?.marketCategory ?? "Unknown",
        fromAmount,
        toAmount,
        fundingGrowthRate,
        fromLOC,
        toLOC,
        avgLOC: (fromLOC + toLOC) / 2,
        daysBetweenRounds: velocity.periodDays || 0,
      };
    })
  );

  // Apply strict quality filters
  const validData = processedData.filter((d) => {
    // Must have valid TDR values (between 0 and 1)
    const validStartTDR =
      d.startTDR !== null && d.startTDR >= 0 && d.startTDR <= 1;
    const validEndTDR = d.endTDR !== null && d.endTDR >= 0 && d.endTDR <= 1;

    // Must have meaningful code base (at least 5000 LOC average)
    const sufficientCode = d.avgLOC >= 5000;

    // Must have reasonable velocity (not zero, not extreme)
    const validVelocity =
      d.compositeVelocity !== null && // Fix: Add an explicit null check.
      d.compositeVelocity > 0 &&
      d.compositeVelocity < 10000;

    // Must have reasonable funding growth (-90% to +500%)
    const validFunding = d.fundingGrowthRate > -90 && d.fundingGrowthRate < 500;

    // Must have meaningful time period (at least 90 days)
    const validPeriod = d.periodDays >= 90;

    return (
      validStartTDR &&
      validEndTDR &&
      sufficientCode &&
      validVelocity &&
      validFunding &&
      validPeriod
    );
  });

  const recordsWithValidTDR = processedData.filter(
    (d) =>
      d.startTDR !== null &&
      d.startTDR >= 0 &&
      d.startTDR <= 1 &&
      d.endTDR !== null &&
      d.endTDR >= 0 &&
      d.endTDR <= 1
  ).length;

  const recordsWithSufficientCode = processedData.filter(
    (d) => d.avgLOC >= 5000
  ).length;

  // If we don't have enough valid data, return a meaningful error state
  if (validData.length < 10) {
    return createEmptyAnalysis(
      totalRecords,
      recordsWithValidTDR,
      recordsWithSufficientCode,
      validData.length,
      "Insufficient valid data points after quality filtering"
    );
  }

  // Calculate metrics using median TDR (average of start and end)
  const tdrValues = validData.map((d) => (d.startTDR! + d.endTDR!) / 2);
  const velocityValues = validData.map((d) => d.compositeVelocity!);
  const fundingGrowthValues = validData.map((d) => d.fundingGrowthRate);
  const tdrChangeValues = validData.map((d) =>
    d.startTDR! > 0 ? ((d.endTDR! - d.startTDR!) / d.startTDR!) * 100 : 0
  );

  // Remove outliers for robust statistics
  const cleanTDR = removeOutliers(tdrValues);
  const cleanVelocity = removeOutliers(velocityValues);
  const cleanFunding = removeOutliers(fundingGrowthValues);

  // Calculate correlations
  const correlations = {
    tdr_velocity: calculateCorrelation(cleanTDR, cleanVelocity),
    tdr_funding: calculateCorrelation(cleanTDR, cleanFunding),
    velocity_funding: calculateCorrelation(cleanVelocity, cleanFunding),
    tdrChange_funding: calculateCorrelation(
      tdrChangeValues,
      fundingGrowthValues
    ),
  };

  // Regression analysis using simple-statistics
  const regressionData: [number, number][] = validData.map((d) => [
    (d.startTDR! + d.endTDR!) / 2,
    d.compositeVelocity!,
  ]);

  let regressionSlope = 0;
  if (regressionData.length > 1) {
    const result = linearRegression(regressionData);
    regressionSlope = result.m;
  }

  // For simple linear regression, R-squared is the square of the correlation coefficient
  const rSquared = Math.pow(correlations.tdr_velocity, 2);

  // Calculate p-value and significance
  const pValue = calculatePValue(correlations.tdr_velocity, validData.length);
  let significanceLevel = "not significant";
  if (pValue < 0.001) significanceLevel = "highly significant (p<0.001)";
  else if (pValue < 0.01) significanceLevel = "significant (p<0.01)";
  else if (pValue < 0.05) significanceLevel = "significant (p<0.05)";
  else if (pValue < 0.1) significanceLevel = "marginally significant (p<0.1)";

  // Strategic framework analysis using medians
  const medianTDR = calculateMedian(tdrValues);
  const medianVelocity = calculateMedian(velocityValues);

  const quadrants = {
    lowDebtHighVelocity: validData.filter(
      (d) =>
        (d.startTDR! + d.endTDR!) / 2 <= medianTDR &&
        d.compositeVelocity! > medianVelocity
    ),
    highDebtHighVelocity: validData.filter(
      (d) =>
        (d.startTDR! + d.endTDR!) / 2 > medianTDR &&
        d.compositeVelocity! > medianVelocity
    ),
    lowDebtLowVelocity: validData.filter(
      (d) =>
        (d.startTDR! + d.endTDR!) / 2 <= medianTDR &&
        d.compositeVelocity! <= medianVelocity
    ),
    highDebtLowVelocity: validData.filter(
      (d) =>
        (d.startTDR! + d.endTDR!) / 2 > medianTDR &&
        d.compositeVelocity! <= medianVelocity
    ),
  };

  // Calculate quadrant metrics
  const calculateQuadrantMetrics = (data: any[]) => ({
    count: data.length,
    avgFundingGrowth:
      data.length > 0
        ? data.reduce((sum, d) => sum + d.fundingGrowthRate, 0) / data.length
        : 0,
    successRate:
      data.length > 0
        ? (data.filter((d) => d.gotNextRound).length / data.length) * 100
        : 0,
    avgTDR:
      data.length > 0
        ? data.reduce((sum, d) => sum + (d.startTDR! + d.endTDR!) / 2, 0) /
          data.length
        : 0,
    avgVelocity:
      data.length > 0
        ? data.reduce((sum, d) => sum + d.compositeVelocity!, 0) / data.length
        : 0,
  });

  // Quartile analysis
  const tdrSorted = [...validData].sort(
    (a, b) => (a.startTDR! + a.endTDR!) / 2 - (b.startTDR! + b.endTDR!) / 2
  );
  const velocitySorted = [...validData].sort(
    (a, b) => a.compositeVelocity! - b.compositeVelocity!
  );

  const quartileSize = Math.floor(validData.length / 4);
  const tdrQuartiles = [
    tdrSorted.slice(0, quartileSize),
    tdrSorted.slice(quartileSize, quartileSize * 2),
    tdrSorted.slice(quartileSize * 2, quartileSize * 3),
    tdrSorted.slice(quartileSize * 3),
  ];

  const velocityQuartiles = [
    velocitySorted.slice(0, quartileSize),
    velocitySorted.slice(quartileSize, quartileSize * 2),
    velocitySorted.slice(quartileSize * 2, quartileSize * 3),
    velocitySorted.slice(quartileSize * 3),
  ];

  // Market Category Analysis
  const byMarketCategory = validData.reduce((acc, d) => {
    const category = d.marketCategory || "Other";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(d);
    return acc;
  }, {} as Record<string, any[]>);

  const marketCategoryAnalysis: MarketCategoryAnalysis[] = Object.entries(
    byMarketCategory
  )
    .map(([category, data]) => ({
      category,
      ...calculateQuadrantMetrics(data),
    }))
    .sort((a, b) => b.count - a.count);

  // Generate insights
  const insights = generateInsights(
    correlations.tdr_velocity,
    significanceLevel,
    validData.length,
    totalRecords
  );

  return {
    summary: {
      totalVentures: await db
        .select()
        .from(companies)
        .then((r) => r.length),
      validDataPoints: validData.length,
      filteredDataPoints: totalRecords - validData.length,
      avgFundingGrowthRate: calculateMedian(cleanFunding),
      avgDaysBetweenRounds: calculateMedian(
        validData.map((d) => d.daysBetweenRounds)
      ),
      avgTechnicalDebtRatio: calculateMedian(tdrValues),
      avgDevelopmentVelocity: calculateMedian(velocityValues),
      fundingSuccessRate:
        (validData.filter((d) => d.gotNextRound).length / validData.length) *
        100,
    },

    dataQuality: {
      totalRecords,
      recordsWithValidTDR,
      recordsWithSufficientCode,
      recordsUsedInAnalysis: validData.length,
      filteringReason: `Filtered ${
        totalRecords - validData.length
      } records: Required TDR 0-1, LOC >5000, period >90 days`,
    },

    strategicFramework: {
      lowDebtHighVelocity: calculateQuadrantMetrics(
        quadrants.lowDebtHighVelocity
      ),
      highDebtHighVelocity: calculateQuadrantMetrics(
        quadrants.highDebtHighVelocity
      ),
      lowDebtLowVelocity: calculateQuadrantMetrics(
        quadrants.lowDebtLowVelocity
      ),
      highDebtLowVelocity: calculateQuadrantMetrics(
        quadrants.highDebtLowVelocity
      ),
    },

    statisticalAnalysis: {
      correlation_TDR_velocity: correlations.tdr_velocity,
      correlation_TDR_funding: correlations.tdr_funding,
      correlation_velocity_funding: correlations.velocity_funding,
      correlation_TDRchange_funding: correlations.tdrChange_funding,
      regressionSlope,
      rSquared,
      pValue,
      significanceLevel,
    },

    fundingAnalysis: {
      byTDRQuartile: tdrQuartiles.map((q, i) => ({
        quartile: `Q${i + 1}`,
        avgTDR:
          q.length > 0
            ? q.reduce((sum, d) => sum + (d.startTDR! + d.endTDR!) / 2, 0) /
              q.length
            : 0,
        avgFundingGrowth:
          q.length > 0
            ? q.reduce((sum, d) => sum + d.fundingGrowthRate, 0) / q.length
            : 0,
        successRate:
          q.length > 0
            ? (q.filter((d) => d.gotNextRound).length / q.length) * 100
            : 0,
        count: q.length,
      })),
      byVelocityQuartile: velocityQuartiles.map((q, i) => ({
        quartile: `Q${i + 1}`,
        avgVelocity:
          q.length > 0
            ? q.reduce((sum, d) => sum + d.compositeVelocity!, 0) / q.length
            : 0,
        avgFundingGrowth:
          q.length > 0
            ? q.reduce((sum, d) => sum + d.fundingGrowthRate, 0) / q.length
            : 0,
        successRate:
          q.length > 0
            ? (q.filter((d) => d.gotNextRound).length / q.length) * 100
            : 0,
        count: q.length,
      })),
      byMarketCategory: marketCategoryAnalysis,
    },

    insights,
    exportDate: new Date().toISOString(),
  };
}

function generateInsights(
  correlation: number,
  significance: string,
  validPoints: number,
  totalPoints: number
): any {
  const filterRate = (
    ((totalPoints - validPoints) / totalPoints) *
    100
  ).toFixed(1);

  return {
    primaryFinding:
      Math.abs(correlation) > 0.3
        ? `Moderate ${
            correlation < 0 ? "negative" : "positive"
          } correlation (r=${correlation.toFixed(
            3
          )}) between technical debt and development velocity (${significance}).`
        : `Weak to no correlation (r=${correlation.toFixed(
            3
          )}) between technical debt and development velocity.`,

    dataQualityNote: `Analysis based on ${validPoints} high-quality data points out of ${totalPoints} total records (${filterRate}% filtered). Filtering criteria: TDR 0-1, >5000 LOC, >90 day periods.`,

    practicalImplication:
      Math.abs(correlation) > 0.3
        ? `Technical debt appears to ${
            correlation < 0 ? "impede" : "correlate with"
          } development velocity in mature codebases. This relationship is ${significance}.`
        : `No clear relationship between technical debt and development velocity found in this sample. Other factors may be more important.`,

    limitations: `Key limitations: (1) Sample limited to open-source ventures, (2) TDR calculation depends on Qlty's effort estimates, (3) Temporal lag may not capture all effects, (4) Survivorship bias in funded companies.`,
  };
}

function createEmptyAnalysis(
  total: number,
  validTDR: number,
  sufficientCode: number,
  used: number,
  reason: string
): EntrepreneurshipAnalysis {
  return {
    summary: {
      totalVentures: 0,
      validDataPoints: 0,
      filteredDataPoints: total,
      avgFundingGrowthRate: 0,
      avgDaysBetweenRounds: 0,
      avgTechnicalDebtRatio: 0,
      avgDevelopmentVelocity: 0,
      fundingSuccessRate: 0,
    },
    dataQuality: {
      totalRecords: total,
      recordsWithValidTDR: validTDR,
      recordsWithSufficientCode: sufficientCode,
      recordsUsedInAnalysis: used,
      filteringReason: reason,
    },
    strategicFramework: {
      lowDebtHighVelocity: {
        count: 0,
        avgFundingGrowth: 0,
        successRate: 0,
        avgTDR: 0,
        avgVelocity: 0,
      },
      highDebtHighVelocity: {
        count: 0,
        avgFundingGrowth: 0,
        successRate: 0,
        avgTDR: 0,
        avgVelocity: 0,
      },
      lowDebtLowVelocity: {
        count: 0,
        avgFundingGrowth: 0,
        successRate: 0,
        avgTDR: 0,
        avgVelocity: 0,
      },
      highDebtLowVelocity: {
        count: 0,
        avgFundingGrowth: 0,
        successRate: 0,
        avgTDR: 0,
        avgVelocity: 0,
      },
    },
    statisticalAnalysis: {
      correlation_TDR_velocity: 0,
      correlation_TDR_funding: 0,
      correlation_velocity_funding: 0,
      correlation_TDRchange_funding: 0,
      regressionSlope: 0,
      rSquared: 0,
      pValue: 1,
      significanceLevel: "not significant",
    },
    fundingAnalysis: {
      byTDRQuartile: [],
      byVelocityQuartile: [],
      byMarketCategory: [],
    },
    insights: {
      primaryFinding: reason,
      dataQualityNote: `Only ${used} records passed quality filters out of ${total} total.`,
      practicalImplication:
        "Analysis cannot be performed with current data quality.",
      limitations: "Insufficient valid data for meaningful analysis.",
    },
    exportDate: new Date().toISOString(),
  };
}
