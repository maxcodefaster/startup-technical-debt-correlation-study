# Startup Technical Debt Analysis

Automated analysis of technical debt in startup repositories using SonarQube Community Edition.

## Quick Start

### 1. Install Dependencies
```bash
bun install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env and add your SonarQube token (see step 4)
```

### 3. Start SonarQube Server
```bash
bun run sonar:up
```
*Wait 2-3 minutes for startup*

### 4. Get SonarQube Token

1. Open http://localhost:9000
2. Login: `admin` / `admin` (change password when prompted)
3. Go to: Administration → Security → Users → admin → Tokens
4. Generate token and update `.env`:
   ```bash
   SONAR_TOKEN=squ_your_actual_token_here
   ```

### 5. Run Analysis
```bash
bun run start
```

## What It Does

- ✅ Analyzes code at each funding round + exit date
- ✅ Collects technical debt metrics via SonarQube
- ✅ Stores results in SQLite database
- ✅ Handles 50+ programming languages
- ✅ Auto-manages Docker containers

## Key Metrics Collected

- **Technical Debt**: SQALE index, debt ratio, TD density
- **Quality Issues**: Code smells, bugs, vulnerabilities
- **Code Structure**: Complexity, duplication, coverage
- **Quality Ratings**: Maintainability, reliability, security (A-E)

## Troubleshooting

### ❌ "SONAR_TOKEN environment variable is required"
Configure your `.env` file with token from step 4.

### ❌ "Cannot connect to SonarQube server"
```bash
bun run sonar:down
bun run sonar:up
# Wait 3 minutes, then retry
```

### ❌ "SonarQube scanner container not available"
System auto-manages containers. If issues persist:
```bash
docker-compose up -d sonar-scanner
```

## Commands

```bash
# Basic analysis
bun run start companies.csv

# View database
bun run studio

# Check logs
bun run sonar:logs

# Stop services
bun run sonar:down
```

## Expected Runtime

- **~2-5 minutes** per repository (cloning + analysis)
- **4-8 hours** for full dataset (74 companies)
- **Sequential processing** to avoid overwhelming SonarQube


## How It Works

The analysis pipeline:

1. **Import CSV** → Parse funding data into SQLite
2. **For Each Company:**
   - Clone repository
   - For each funding date + exit date:
     - Checkout code at that date (or closest available)
     - Analyze repository structure  
     - Run SonarQube analysis
     - Store all metrics
   - Cleanup repository

## SonarQube Strategy

**Language Agnostic**: SonarQube Community analyzes source code without compilation for:
- ✅ JavaScript/TypeScript, Python, Go, PHP, Ruby, CSS, HTML
- ⚠️ Java/C++ (limited without compilation but still valuable)

**Smart Fallbacks**: When exact funding dates don't have commits:
- Uses first commit after the date
- Falls back to first commit in repository
- Logs which strategy was used

## Database Schema

- **companies** → Company info + exit data
- **funding_rounds** → All funding events
- **repository_info** → Repository characteristics per date  
- **code_snapshots** → SonarQube metrics per date
- **analysis_log** → Detailed execution logs

## Key Metrics Collected

- **Technical Debt**: SQALE index, debt ratio, TD density
- **Quality Issues**: Code smells, bugs, vulnerabilities, security hotspots
- **Code Structure**: Complexity, cognitive complexity, duplication  
- **Quality Ratings**: Maintainability, reliability, security (A-E)
- **Coverage**: Line coverage, branch coverage (if available)

## Analysis Points

For each company, code is analyzed at:
- ✅ Series A date
- ✅ Series B date (if exists)  
- ✅ All other funding rounds
- ✅ Exit date (if applicable)

## Expected Runtime

For 74 companies with ~3 funding rounds each:
- **Repository cloning**: ~2-5 minutes per repo
- **SonarQube analysis**: ~30-60 seconds per snapshot
- **Total estimated time**: ~4-8 hours for full dataset
