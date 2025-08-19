# Banking App Mock Data Generator

A TypeScript data generator that creates realistic telemetry data for East African banking applications, including analytics events, performance metrics, and crash reports.

## What it generates

**Raw Events** (45,000 events by default)
- Analytics events: user interactions, transactions, logins
- Performance metrics: API calls, screen renders, traces, app startup
- Crash reports: fatal/non-fatal crashes with stack traces

**Daily Rollups** (pre-aggregated metrics)
- Event counts, user counts, session counts by day and dimensions
- Performance percentiles (p50, p90, p99)
- Error rates and crash rates

## Features

- **Realistic banking workflows**: account management, transfers, bill payments, KYC
- **Multi-region support**: Kenya, Uganda, Tanzania, Rwanda, DRC, South Sudan
- **Multi-platform**: iOS, Android, Web (including branch/staff apps)
- **Release channels**: prod, pilot, uat, dev with realistic adoption curves
- **Network conditions**: WiFi, cellular, offline with region-appropriate latencies
- **Device diversity**: Mix of high/mid/low-tier devices popular in East Africa
- **Crash simulation**: Realistic crash patterns with release spikes and device correlations
- **Data validation**: Built-in validator checks distributions, business logic, and data quality

## Usage

```bash
# Install dependencies
bun install

# Generate data
bun main.ts
```

## Output

Creates three files in `data/`:
- `raw_events.json` - Individual event records
- `daily_rollups.json` - Pre-aggregated daily metrics  
- `validation_report.json` - Data quality report

## Configuration

Edit the `CONFIG` object to adjust:
- Total event count
- Date range
- Event type ratios (analytics/performance/crash)
- Sessions per day

## Banking Context

Simulates three applications:
- **EABank Mobile**: Consumer banking app (multi-country)
- **Bancaire DRC**: DRC-specific consumer app
- **EABank Branch**: Staff/teller application

Includes realistic banking events like domestic transfers, bill payments, loan applications, KYC verification, and cash transactions.

## Data Schema

See the generated JSON files for complete schema. Key event types:

- **Analytics**: `login_success`, `transaction_completed`, `customer_account_opened`
- **Performance**: HTTP API calls, screen renders, traces, app startup
- **Crashes**: Network timeouts, auth failures, memory issues, ANRs

Generated data includes proper localization (English, Swahili, French, Kinyarwanda, Chinese), regional carriers, and banking-specific business context.