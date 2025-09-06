# Startup Technical Debt Analysis

Automated analysis of technical debt in startup repositories using SonarQube Community Edition.

## Quick Start

### 1. Install Dependencies
```bash
bun install
```

### 2. Install SonarQube Scanner

Choose your platform:

**macOS (Homebrew):**
```bash
brew install sonar-scanner
```

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install sonar-scanner
```

**Manual Installation (All platforms):**
```bash
# Download latest scanner
wget https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-4.8.0.2856-linux.zip

# Extract
unzip sonar-scanner-cli-4.8.0.2856-linux.zip

# Add to PATH or move to /usr/local/bin
sudo mv sonar-scanner-4.8.0.2856-linux/bin/sonar-scanner /usr/local/bin/

# Verify installation
sonar-scanner --version
```

**Windows (Chocolatey):**
```bash
choco install sonar-scanner-msbuild
```

### 3. Start SonarQube Server
```bash
bun run sonar:up
```
*Wait 2-3 minutes for complete startup*

### 4. Configure SonarQube Token

1. **Open SonarQube**: http://localhost:9000
2. **Login**: `admin` / `admin` (change password when prompted)
3. **Generate Token**:
   - Go to: Administration → Security → Users
   - Click admin → Tokens tab
   - Generate new token, copy it
4. **Update Code**: Paste token in `sonar-analyzer.ts`:
   ```typescript
   const SONAR_TOKEN = "squ_your_actual_token_here";
   ```

### 5. Setup Database
```bash
bun run generate  # Generate SQL migrations
bun run migrate   # Apply to database
```

### 6. Run Analysis
```bash
bun run start your_data.csv
```

## Troubleshooting

### ❌ "sonar-scanner: command not found"
**Solution**: Install SonarQube Scanner (see step 2 above)

**Verify installation:**
```bash
which sonar-scanner
sonar-scanner --version
```

### ❌ "Cannot connect to SonarQube server"
**Solutions:**
```bash
# Check if SonarQube is running
bun run sonar:logs

# Restart if needed
bun run sonar:down
bun run sonar:up

# Wait 2-3 minutes, then verify
curl http://localhost:9000/api/system/health
```

### ❌ "SonarQube token not configured"
**Solution**: Follow step 4 above to generate and configure token

### ❌ "No commits found before [date]"
**Expected**: The script automatically handles this by using the closest available commit

### ⚠️ Large Repositories
**Expected**: Analysis may take 5+ minutes per repo. The script includes timeouts and continues automatically.

## Architecture

```
├── index.ts          # Main orchestrator
├── db.ts             # Database connection  
├── schema.ts         # Drizzle schema (your existing file)
├── csv-importer.ts   # CSV data import
├── git-handler.ts    # Git operations & repo analysis
├── sonar-analyzer.ts # SonarQube integration  
├── migrate.ts        # Database migrations
└── docker-compose.yml # SonarQube setup
```

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

Perfect for comparing technical debt at Series A vs Series B success! 🎯

## Usage Examples

```bash
# Basic analysis
bun run start companies.csv

# View database in browser
bun run studio

# Check SonarQube logs
bun run sonar:logs

# Stop SonarQube  
bun run sonar:down

# Restart everything
bun run sonar:down && bun run sonar:up
```

## Performance Notes

- **Sequential Processing**: One repo at a time to avoid overwhelming SonarQube
- **Auto-cleanup**: Repositories are deleted after analysis
- **Graceful Errors**: Failed analyses are logged but don't stop the pipeline
- **Progress Tracking**: Detailed console output + database logs
- **Smart Git Handling**: Uses closest available commits when exact dates don't exist

## Expected Runtime

For 74 companies with ~3 funding rounds each:
- **Repository cloning**: ~2-5 minutes per repo
- **SonarQube analysis**: ~30-60 seconds per snapshot
- **Total estimated time**: ~4-8 hours for full dataset

Perfect for running overnight! 🌙

## Quick Verification

Test your setup:
```bash
# 1. Check SonarQube Scanner
sonar-scanner --version

# 2. Check SonarQube Server  
curl http://localhost:9000/api/system/health

# 3. Test with small dataset
head -5 your_data.csv > test.csv
bun run start test.csv
```