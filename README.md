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

## Raw Events JSON Schema

**Array of event objects** — Each object represents a single analytics, performance, or crash event.

---

### Core Fields
*Present on all events*

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (e.g., "evt_<uuid>") |
| `timestamp` | string | ISO 8601 UTC timestamp (e.g., "2025-07-15T10:42:17.123Z") |
| `day` | string | Date in YYYY-MM-DD format, derived from timestamp |
| `hour` | number | Hour 0-23 UTC, derived from timestamp |
| `source` | enum | Event category: `"analytics"` \| `"performance"` \| `"crash"` |
| `event_name` | string | Generic event name (varies by source type) |
| `session_id` | string | Groups events within a single app session |
| `user_pseudo_id` | string | Pseudonymous user identifier across sessions |
| `count` | number | Always `1` in this dataset |

### Application Context

| Field | Type | Values |
|-------|------|--------|
| `app_id` | enum | `"eabank_main"` \| `"bancaire_drc"` \| `"eabank_branch"` |
| `app_name` | string | Human-readable app name |
| `platform` | enum | `"ios"` \| `"android"` \| `"web"` |
| `release_channel` | enum | `"dev"` \| `"uat"` \| `"pilot"` \| `"prod"` |
| `app_version` | string | Version string (e.g., "3.2.1", "3.3.1-uat.5") |
| `build_number` | string | Platform-specific build identifier |
| `os_version` | string | OS version (e.g., "iOS 16.4", "Android 12", "Web") |

### Device & Location

| Field | Type | Values |
|-------|------|--------|
| `device_model` | string | Device name (e.g., "iPhone 12", "Samsung Galaxy A13") |
| `device_tier` | enum | `"low"` \| `"mid"` \| `"high"` |
| `country` | enum | `"KE"` \| `"UG"` \| `"TZ"` \| `"RW"` \| `"DRC"` \| `"SS"` |
| `locale` | enum | `"EN"` \| `"SW"` \| `"RW"` \| `"FR"` \| `"ZH"` |
| `network_type` | enum | `"wifi"` \| `"cellular"` \| `"offline"` |
| `carrier` | string? | Cellular carrier name (when network_type = "cellular") |

---

### Analytics Events
*When `source = "analytics"`*

**Core Analytics Fields**
```
analytics_event: string    // Specific event type
screen: string?           // Screen name where event occurred
```

**Business Context** *(conditional)*
```
value_num: number?           // Transaction amount or count
currency: string?            // "KES" | "UGX" | "TZS" | "USD"
transaction_type: string?    // "domestic_transfer" | "bill_payment" | etc.
account_type: string?        // "savings" | "current" | "fixed_deposit" | "loan"
branch_code: string?         // Format: "CC_AREA_NNN" (e.g., "KE_CBD_042")
```

**Common Analytics Events**
- Customer: `"login_success"`, `"balance_check"`, `"transaction_completed"`, `"bill_payment"`, `"login_failed"`
- Branch: `"customer_account_opened"`, `"transaction_processed"`, `"kyc_completed"`, `"cash_deposit"`

---

### Performance Events
*When `source = "performance"`*

**Base Performance Fields**
```
perf_type: "http" | "trace" | "screen" | "app_start"
duration_ms: number
```

#### HTTP Performance (`perf_type = "http"`)
```json
{
  "event_name": "api_call",
  "http_method": "GET" | "POST" | "PUT",
  "url_path": "v3/accounts/balance",
  "status_code": 200,
  "success": true,
  "ttfb_ms": 415,
  "payload_bytes": 7123,
  "screen": "AccountBalance"
}
```

#### Screen Performance (`perf_type = "screen"`)
```json
{
  "event_name": "screen",
  "screen": "Dashboard",
  "fps_avg": 45
}
```

#### Trace Performance (`perf_type = "trace"`)
```json
{
  "event_name": "trace",
  "trace_name": "banking:risk_assessment",
  "cpu_ms": 640,
  "memory_mb": 82
}
```

#### App Start (`perf_type = "app_start"`)
```json
{
  "event_name": "app_start"
  // duration_ms only
}
```

---

### Crash Events
*When `source = "crash"`*

```json
{
  "event_name": "crash",
  "is_crash": 1,
  "is_fatal": 0,
  "crash_type": "anr",
  "exception_type": "ANRException",
  "crash_group_id": "cg_ui_thread_block",
  "foreground": true
}
```

**Crash Types by Platform**
- Android: `"fatal"`, `"nonfatal"`, `"anr"`
- iOS/Web: `"fatal"`, `"nonfatal"`

---

### Example Records

**Analytics Transaction**
```json
{
  "id": "evt_7f9b2a5b-0f25-44d0-87f8-2c4e6b2b13a2",
  "timestamp": "2025-07-15T10:42:17.123Z",
  "day": "2025-07-15",
  "hour": 10,
  "source": "analytics",
  "event_name": "transaction_completed",
  "analytics_event": "transaction_completed",
  "app_id": "eabank_main",
  "platform": "android",
  "release_channel": "prod",
  "app_version": "3.2.1",
  "country": "KE",
  "locale": "SW",
  "session_id": "s_banking_7a2f",
  "user_pseudo_id": "u_ke_customer_1234",
  "screen": "TransferConfirmation",
  "transaction_type": "domestic_transfer",
  "value_num": 41231,
  "currency": "KES",
  "count": 1,
  "revenue_usd": 0,
  "is_crash": 0,
  "is_fatal": 0
}
```

**Performance HTTP**
```json
{
  "id": "evt_4a9b0b52-3b3f-43e0-9d53-7a38a56ebc65",
  "timestamp": "2025-07-15T13:05:44.891Z",
  "day": "2025-07-15",
  "hour": 13,
  "source": "performance",
  "event_name": "api_call",
  "perf_type": "http",
  "app_id": "eabank_main",
  "platform": "ios",
  "http_method": "GET",
  "url_path": "v3/accounts/balance",
  "status_code": 200,
  "success": true,
  "duration_ms": 1038,
  "ttfb_ms": 415,
  "session_id": "s_banking_a3b1",
  "user_pseudo_id": "u_ke_customer_5678",
  "count": 1,
  "is_crash": 0,
  "is_fatal": 0
}
```

═══════════════════════════════════════════════════════════════════════════════

## Daily Rollups JSON Schema

**Array of aggregate objects** — Pre-computed metrics grouped by day and dimensions.

---

### Grouping Logic

Each rollup represents a unique combination of:
```
day + source + platform + app_id + app_version + 
release_channel + country + device_tier + event_group
```

**Event Group Mapping**
- Performance → `"performance:<event_name>"` (e.g., "performance:api_call")
- Analytics → `"analytics:<analytics_event>"` (e.g., "analytics:login_success") 
- Crash → `"crash:fatal"` or `"crash:nonfatal"`

---

### Rollup Fields

#### Dimensions
```typescript
{
  day: string,                    // "2025-07-15"
  source: "analytics" | "performance" | "crash",
  platform: "ios" | "android" | "web",
  app_id: "eabank_main" | "bancaire_drc" | "eabank_branch",
  app_version: string,
  release_channel: "dev" | "uat" | "pilot" | "prod",
  country: "KE" | "UG" | "TZ" | "RW" | "DRC" | "SS",
  device_tier: "low" | "mid" | "high",
  event_group: string
}
```

#### Aggregates
```typescript
{
  events_count: number,           // Total events in slice
  users_count: number,            // Unique users in slice
  sessions_count: number,         // Unique sessions in slice
  
  // Duration stats (performance events only)
  avg_duration_ms?: number,
  p50_duration_ms?: number,
  p90_duration_ms?: number,
  p99_duration_ms?: number,
  
  // Error rates (conditional)
  http_error_rate?: number,       // 0.0-1.0 for performance:api_call
  crash_rate_per_1k_sessions?: number,  // For crash event_groups
  
  // Revenue placeholders
  revenue_usd: 0,
  purchase_count: 0
}
```

---

### Example Rollup

```json
{
  "day": "2025-07-15",
  "source": "performance",
  "platform": "android",
  "app_id": "eabank_main",
  "app_version": "3.2.1",
  "release_channel": "prod",
  "country": "KE",
  "device_tier": "low",
  "event_group": "performance:api_call",
  "events_count": 143,
  "users_count": 112,
  "sessions_count": 119,
  "avg_duration_ms": 1184,
  "p50_duration_ms": 1027,
  "p90_duration_ms": 1833,
  "p99_duration_ms": 2941,
  "http_error_rate": 0.119,
  "revenue_usd": 0,
  "purchase_count": 0
}
```

═══════════════════════════════════════════════════════════════════════════════

## Usage Notes

**Time Zones**: All timestamps are UTC. Use `timestamp` as canonical time; `day`/`hour` are for bucketing.

**Optional Fields**: Type-specific fields are omitted when not applicable (e.g., `http_method` only appears for HTTP performance events).

**Currency Logic**: Only set for analytics "transaction_completed" events:
- KE → KES, UG → UGX, TZ → TZS, others → USD

**Success vs Status**: For HTTP events, `success = (status_code < 400)`

**Country Bias**: Kenya (KE) represents ~55% of events by design.