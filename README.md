# Master's Thesis: An Empirical Analysis of Technical Debt and Execution Speed in Venture-Backed Startups

This repository contains the source code and data for the master's thesis, "Technical Debt as a Strategic Trade-Off: An Empirical Analysis of Execution Speed and Funding Success in Venture-Backed Startups."

## Abstract

This study investigates the relationship between technical debt and performance in technology startups, challenging the conventional wisdom that technical debt is universally detrimental. The core conflict for startups between the need for high-speed execution and the risk of accumulating technical debt is well-documented but lacks large-scale empirical analysis. This research addresses that gap through a novel, automated analysis of 70 open-source, venture-backed companies, examining code quality (via Technical Debt Ratio) and development speed (using a composite velocity metric) across 120 distinct inter-funding periods.

The key finding is a weak, marginally significant negative correlation (r=−0.155, p=0.089) between technical debt and development velocity. However, the analysis reveals that development velocity is a far more significant predictor of a startup's ability to secure subsequent funding. Notably, ventures characterized by both **High Technical Debt and High Development Velocity** achieved the highest rates of funding success (69%). This suggests that, in an early-stage venture context, technical debt may be a rational strategic trade-off undertaken to achieve the speed necessary to secure market traction and investor confidence. This thesis contributes a reproducible, large-scale methodology for technical debt analysis and provides empirical evidence that reframes technical debt as a nuanced strategic instrument rather than a simple liability.

## Research Questions

* **RQ1:** What is the statistical relationship between the accumulation of technical debt and development velocity in venture-backed software companies?
* **RQ2:** How do technical debt and development velocity, individually and in combination, associate with a startup's ability to secure subsequent rounds of funding?

## Methodology Overview

The research employs a quantitative, longitudinal design. The analysis pipeline, detailed in the source code, automates the following process:

1.  **Data Ingestion:** Company and funding data are imported from `data/startup_seed_data.csv`.
2.  **Repository Analysis:** For each of the 70 companies, their public Git repository is cloned.
3.  **Longitudinal Snapshotting:** The codebase is checked out at the specific date of each funding round to create a series of historical snapshots.
4.  **Metric Calculation:**
    * **Technical Debt Ratio (TDR):** The Qlty CLI is used to analyze each snapshot, calculating the TDR as the ratio of remediation cost (total effort in minutes) to estimated development cost (based on the Basic COCOMO model).
    * **Development Velocity:** A composite metric is calculated for the period between each funding round, balancing code output (churn), iteration frequency (commits), and team engagement (authors).
5.  **Statistical Analysis:** The collected data is subjected to correlation, regression, and quadrant analysis to identify statistical relationships and patterns.

## How to Run the Analysis

This project uses `bun` as the package manager.

1.  **Install Dependencies:**
    ```bash
    bun install
    ```
2.  **Generate Database Schema:**
    ```bash
    bun run generate
    ```
3.  **Run the Complete Analysis Pipeline:**
    ```bash
    bun run start
    ```
    The script will process all companies and output the final statistical results to the console.

4.  **View the Interactive Dashboard:**
    ```bash
    bun run start
    # Then select option 2 from the menu
    ```
    The dashboard will be available at `http://localhost:3000`.

## Thesis Contribution

This work makes three primary contributions:
1.  **Methodological:** It introduces a novel, automated, and reproducible pipeline for the longitudinal analysis of code quality and development velocity in startup ecosystems.
2.  **Empirical:** It provides large-scale, quantitative data to a debate on technical debt that has been largely anecdotal, offering concrete evidence on its real-world impact.
3.  **Theoretical:** It proposes and validates a strategic framework for understanding technical debt not merely as a liability, but as a potential tool for achieving strategic goals in an entrepreneurial context.