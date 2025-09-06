# Startup Technical Debt Analysis

Automated analysis of technical debt in startup repositories using Qlty CLI for comprehensive code quality metrics.

## Quick Start

### 1. Install Dependencies
```bash
bun install
```

### 2. Run Analysis
```bash
bun run start
```

The system will automatically:
- Install Qlty CLI if not present
- Import startup data from CSV
- Analyze each repository at funding dates
- Store results in SQLite database

## What It Does

- ✅ Analyzes code at each funding round + exit date
- ✅ Collects technical debt metrics via Qlty CLI
- ✅ Stores results in SQLite database  
- ✅ Handles 50+ programming languages
- ✅ No Docker containers required - pure CLI tool

## Key Metrics Collected

### Code Quality Metrics
- **Lines of Code**: Total lines analyzed
- **Complexity**: Cyclomatic and cognitive complexity
- **Code Structure**: Function/class counts, nesting depth

### Code Smells Detected
- **Duplication**: Identical and similar code blocks
- **High Complexity**: Complex functions and files
- **Poor Structure**: Many parameters, deep nesting, multiple returns
- **Boolean Logic**: Complex conditional statements

### Quality Indicators
- **Total Code Smells**: Aggregate count of all issues
- **Duplication Percentage**: % of duplicated lines
- **Average/Max Complexity**: Complexity distribution

## Commands

```bash
# Run full analysis
bun run start

# Analyze specific CSV file
bun run start companies.csv

# View database in browser
bun run studio

# Generate new migrations
bun run generate
```

## Expected Runtime

- **~1-3 minutes** per repository (cloning + analysis)
- **2-4 hours** for full dataset (74 companies)
- **Sequential processing** for stability
- **No external services** required

## How It Works

The analysis pipeline:

1. **Generate Migrations** → `bun run generate` creates database schema
2. **Apply Migrations** → Database tables created automatically on first import
3. **Import CSV** → Parse funding data into SQLite
4. **For Each Company:**
   - Clone repository
   - For each funding date + exit date:
     - Checkout code at that date (or closest available)
     - Initialize Qlty configuration
     - Run code smells analysis (`qlty smells --all`)
     - Run metrics analysis (`qlty metrics --all`)
     - Store all metrics in database
   - Cleanup repository

## Qlty Strategy

**Language Agnostic**: Qlty analyzes source code structure for:
- ✅ JavaScript/TypeScript, Python, Go, PHP, Ruby, Java, C++, Rust
- ✅ Works without compilation - pure AST analysis
- ✅ Automatic language detection and configuration

**Smart Fallbacks**: When exact funding dates don't have commits:
- Uses first commit after the date
- Falls back to first commit in repository
- Logs which strategy was used

**Auto-Installation**: Qlty CLI is automatically installed if missing:
```bash
curl https://qlty.sh | sh
```

## Database Schema

- **companies** → Company info + exit data
- **funding_rounds** → All funding events
- **repository_info** → Repository characteristics per date
- **code_snapshots** → Qlty metrics per date
- **analysis_log** → Detailed execution logs

## Key Metrics Collected

### Core Metrics
- **Lines of Code**: Total analyzed lines
- **Complexity**: Cognitive and cyclomatic complexity  
- **Functions/Classes**: Code structure counts

### Code Smells
- **Duplication**: Identical and similar code blocks
- **High Complexity**: Functions and files exceeding thresholds
- **Structure Issues**: Parameter count, nesting, returns
- **Logic Complexity**: Boolean expressions and conditions

### Quality Indicators  
- **Total Code Smells**: Aggregate issue count
- **Duplication %**: Percentage of duplicated code
- **Complexity Stats**: Average, maximum complexity

## Analysis Points

For each company, code is analyzed at:
- ✅ Series A date
- ✅ Series B date (if exists)
- ✅ All other funding rounds  
- ✅ Exit date (if applicable)

## Expected Runtime

For 74 companies with ~3 funding rounds each:
- **Repository cloning**: ~1-2 minutes per repo
- **Qlty analysis**: ~30-90 seconds per snapshot
- **Total estimated time**: ~2-4 hours for full dataset

## Troubleshooting

### ❌ "qlty: command not found"
The system auto-installs Qlty CLI. If manual installation needed:
```bash
curl https://qlty.sh | sh
```

### ❌ "Permission denied" during installation
```bash
chmod +x ~/.local/bin/qlty
# Or install with sudo if needed
```

### ❌ Repository clone failures
Check internet connection and GitHub access. Private repos require authentication.

## Architecture Benefits

**Simplified**: No Docker containers or external services
**Portable**: Runs on macOS, Linux, Windows
**Reliable**: Pure CLI tool with consistent output
**Fast**: Direct file analysis without compilation
**Comprehensive**: 50+ languages supported

## Research Focus

This tool is designed for research into technical debt evolution:
- **Longitudinal Analysis**: Track metrics over funding rounds
- **Comparative Studies**: Compare across companies/languages
- **Correlation Research**: Funding success vs code quality
- **Trend Analysis**: Technical debt accumulation patterns