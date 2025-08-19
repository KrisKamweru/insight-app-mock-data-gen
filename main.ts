import { writeFileSync, existsSync, mkdirSync } from "fs";
import { randomUUID } from "crypto";

// Types
interface RawEvent {
  id: string;
  source: "performance" | "analytics" | "crash";
  timestamp: string;
  day: string;
  hour: number;
  app_id: string;
  app_name: string;
  platform: "ios" | "android" | "web";
  release_channel: "dev" | "uat" | "pilot" | "prod";
  app_version: string;
  build_number: string;
  os_version: string;
  device_model: string;
  device_tier: "low" | "mid" | "high";
  country: string;
  locale: string;
  network_type: "wifi" | "cellular" | "offline";
  carrier?: string;
  session_id: string;
  user_pseudo_id: string;
  count: number;
  event_name: string;
  screen?: string;
  route?: string;
  http_method?: string;
  value_num?: number;
  revenue_usd: number;
  duration_ms?: number;
  ttfb_ms?: number;
  payload_bytes?: number;
  status_code: number;
  success?: boolean;
  fps_avg?: number;
  cpu_ms?: number;
  memory_mb?: number;
  is_crash: 0 | 1;
  is_fatal: 0 | 1;
  crash_group_id?: string;
  exception_type?: string;
  perf_type?: "http" | "trace" | "screen" | "app_start";
  trace_name?: string;
  analytics_event?: string;
  foreground?: boolean;
  crash_type?: "fatal" | "nonfatal" | "anr" | "oom";
  url_path?: string;
  currency?: string;
  transaction_type?: string;
  account_type?: string;
  branch_code?: string;
}

interface DailyRollup {
  day: string;
  source: string;
  platform: string;
  app_id: string;
  app_version: string;
  release_channel: string;
  country: string;
  device_tier: string;
  event_group: string;
  events_count: number;
  users_count: number;
  sessions_count: number;
  avg_duration_ms?: number;
  p50_duration_ms?: number;
  p90_duration_ms?: number;
  p99_duration_ms?: number;
  http_error_rate?: number;
  crash_rate_per_1k_sessions?: number;
  revenue_usd: number;
  purchase_count: number;
}

interface AppVersion {
  version: string;
  build_number: string;
  release_date: string; // ISO date
  days_since_release?: number; // calculated
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  stats: Record<string, any>;
}

// Configuration
const CONFIG = {
  TOTAL_EVENTS_TARGET: 45000,
  DATE_RANGE_DAYS: 60,
  ANALYTICS_RATIO: 0.65,
  PERFORMANCE_RATIO: 0.3,
  CRASH_RATIO: 0.05,
  SESSIONS_PER_DAY: 1200,
  EVENTS_PER_SESSION_AVG: 5.2,
};

// Banking-specific static data
const APPS = [
  {
    id: "eabank_main",
    name: "EABank Mobile",
    countries: ["KE", "UG", "TZ", "SS", "RW"],
  },
  { id: "bancaire_drc", name: "Bancaire DRC", countries: ["DRC"] },
  {
    id: "eabank_branch",
    name: "EABank Branch",
    countries: ["KE", "UG", "TZ", "SS", "RW"],
    isBranchApp: true,
  },
];

const COUNTRIES = [
  {
    code: "KE",
    weight: 0.35,
    carriers: ["Safaricom", "Airtel Kenya"],
    locales: [
      { code: "EN", weight: 0.5, name: "English" },
      { code: "SW", weight: 0.45, name: "Swahili" },
      { code: "ZH", weight: 0.05, name: "Chinese" }, // Chinese diaspora/business
    ],
  },
  {
    code: "UG",
    weight: 0.2,
    carriers: ["MTN Uganda", "Airtel Uganda"],
    locales: [
      { code: "EN", weight: 0.85, name: "English" },
      { code: "SW", weight: 0.15, name: "Swahili" },
    ],
  },
  {
    code: "TZ",
    weight: 0.18,
    carriers: ["Vodacom Tanzania", "Airtel Tanzania"],
    locales: [
      { code: "SW", weight: 0.7, name: "Swahili" },
      { code: "EN", weight: 0.3, name: "English" },
    ],
  },
  {
    code: "RW",
    weight: 0.12,
    carriers: ["MTN Rwanda", "Airtel Rwanda"],
    locales: [
      { code: "RW", weight: 0.6, name: "Kinyarwanda" },
      { code: "EN", weight: 0.25, name: "English" },
      { code: "FR", weight: 0.15, name: "French" },
    ],
  },
  {
    code: "DRC",
    weight: 0.1,
    carriers: ["Orange DRC", "Vodacom DRC"],
    locales: [
      { code: "FR", weight: 0.75, name: "French" },
      { code: "SW", weight: 0.15, name: "Swahili" },
      { code: "EN", weight: 0.1, name: "English" },
    ],
  },
  {
    code: "SS",
    weight: 0.05,
    carriers: ["MTN South Sudan", "Zain South Sudan"],
    locales: [
      { code: "EN", weight: 0.9, name: "English" },
      { code: "FR", weight: 0.1, name: "French" },
    ],
  },
];

const DEVICES = {
  ios: [
    { model: "iPhone 14", tier: "high", weight: 0.08 },
    { model: "iPhone 13", tier: "high", weight: 0.12 },
    { model: "iPhone 12", tier: "mid", weight: 0.15 },
    { model: "iPhone 11", tier: "mid", weight: 0.18 },
    { model: "iPhone SE 3rd gen", tier: "low", weight: 0.25 },
    { model: "iPhone XR", tier: "low", weight: 0.22 },
  ],
  android: [
    { model: "Samsung Galaxy A54", tier: "mid", weight: 0.15 },
    { model: "Samsung Galaxy A34", tier: "mid", weight: 0.18 },
    { model: "Samsung Galaxy A13", tier: "low", weight: 0.2 },
    { model: "Tecno Spark 10", tier: "low", weight: 0.22 },
    { model: "Infinix Note 12", tier: "low", weight: 0.15 },
    { model: "Oppo A57", tier: "low", weight: 0.1 },
  ],
  web: [
    { model: "Chrome Desktop", tier: "high", weight: 0.45 },
    { model: "Safari Desktop", tier: "high", weight: 0.15 },
    { model: "Firefox Desktop", tier: "mid", weight: 0.25 },
    { model: "Chrome Mobile", tier: "mid", weight: 0.15 },
  ],
};

const VERSIONS_WITH_RELEASES = {
  eabank_main: {
    prod: {
      ios: [
        { version: "3.2.1", build_number: "3210", release_date: "2025-07-10" },
        { version: "3.1.5", build_number: "3150", release_date: "2025-06-15" },
        { version: "3.0.8", build_number: "3080", release_date: "2025-05-20" },
        { version: "2.9.3", build_number: "2930", release_date: "2025-04-10" },
      ],
      android: [
        { version: "3.2.1", build_number: "32100", release_date: "2025-07-12" },
        { version: "3.1.5", build_number: "31500", release_date: "2025-06-18" },
        { version: "3.0.8", build_number: "30800", release_date: "2025-05-22" },
        { version: "2.9.3", build_number: "29300", release_date: "2025-04-12" },
      ],
      web: [
        { version: "4.1.2", build_number: "4120", release_date: "2025-07-08" },
        { version: "4.0.8", build_number: "4080", release_date: "2025-06-12" },
        { version: "3.9.5", build_number: "3950", release_date: "2025-05-15" },
      ],
    },
    pilot: {
      ios: [
        {
          version: "3.3.0-pilot.2",
          build_number: "3302",
          release_date: "2025-07-18",
        },
        {
          version: "3.2.2-pilot.1",
          build_number: "3221",
          release_date: "2025-07-05",
        },
      ],
      android: [
        {
          version: "3.3.0-pilot.2",
          build_number: "33002",
          release_date: "2025-07-19",
        },
        {
          version: "3.2.2-pilot.1",
          build_number: "32201",
          release_date: "2025-07-06",
        },
      ],
      web: [
        {
          version: "4.2.0-pilot.2",
          build_number: "4202",
          release_date: "2025-07-16",
        },
        {
          version: "4.2.0-pilot.1",
          build_number: "4201",
          release_date: "2025-07-14",
        },
      ],
    },
    uat: {
      ios: [
        {
          version: "3.3.1-uat.5",
          build_number: "3315",
          release_date: "2025-07-19",
        },
        {
          version: "3.3.0-uat.8",
          build_number: "3308",
          release_date: "2025-07-12",
        },
      ],
      android: [
        {
          version: "3.3.1-uat.5",
          build_number: "33105",
          release_date: "2025-07-19",
        },
        {
          version: "3.3.0-uat.8",
          build_number: "33008",
          release_date: "2025-07-13",
        },
      ],
      web: [
        {
          version: "4.2.1-uat.3",
          build_number: "4213",
          release_date: "2025-07-18",
        },
        {
          version: "4.2.0-uat.7",
          build_number: "4207",
          release_date: "2025-06-14",
        },
      ],
    },
    dev: {
      ios: [
        {
          version: "3.4.0-dev.12",
          build_number: "34012",
          release_date: "2025-07-19",
        },
        {
          version: "3.4.0-dev.11",
          build_number: "34011",
          release_date: "2025-07-18",
        },
        {
          version: "3.4.0-dev.10",
          build_number: "34010",
          release_date: "2025-07-17",
        },
      ],
      android: [
        {
          version: "3.4.0-dev.12",
          build_number: "340012",
          release_date: "2025-07-19",
        },
        {
          version: "3.4.0-dev.11",
          build_number: "340011",
          release_date: "2025-07-18",
        },
      ],
      web: [
        {
          version: "4.3.0-dev.8",
          build_number: "4308",
          release_date: "2025-07-19",
        },
        {
          version: "4.2.0-dev.3",
          build_number: "4203",
          release_date: "2025-07-18",
        },
        {
          version: "4.1.0-dev.5",
          build_number: "4105",
          release_date: "2025-07-17",
        },
      ],
    },
  },
  bancaire_drc: {
    prod: {
      ios: [
        { version: "2.1.3", build_number: "213", release_date: "2025-07-14" },
        { version: "2.0.9", build_number: "209", release_date: "2025-06-20" },
      ],
      android: [
        { version: "2.1.3", build_number: "21300", release_date: "2025-07-15" },
        { version: "2.0.9", build_number: "20900", release_date: "2025-06-22" },
      ],
      web: [
        { version: "2.5.1", build_number: "251", release_date: "2025-07-11" },
      ],
    },
    pilot: {
      ios: [
        {
          version: "2.2.0-pilot.1",
          build_number: "2201",
          release_date: "2025-07-17",
        },
      ],
      android: [
        {
          version: "2.2.0-pilot.1",
          build_number: "22001",
          release_date: "2025-07-17",
        },
      ],
      web: [
        {
          version: "2.6.0-pilot.1",
          build_number: "2601",
          release_date: "2025-07-16",
        },
      ],
    },
    uat: {
      ios: [
        {
          version: "2.2.1-uat.3",
          build_number: "2213",
          release_date: "2025-07-18",
        },
      ],
      android: [
        {
          version: "2.2.1-uat.3",
          build_number: "22103",
          release_date: "2025-07-18",
        },
      ],
      web: [
        {
          version: "2.6.1-uat.2",
          build_number: "2612",
          release_date: "2025-07-18",
        },
      ],
    },
    dev: {
      ios: [
        {
          version: "2.3.0-dev.5",
          build_number: "2305",
          release_date: "2025-07-19",
        },
      ],
      android: [
        {
          version: "2.3.0-dev.5",
          build_number: "23005",
          release_date: "2025-07-19",
        },
      ],
      web: [
        {
          version: "2.7.0-dev.3",
          build_number: "2703",
          release_date: "2025-07-19",
        },
      ],
    },
  },
  eabank_branch: {
    prod: {
      web: [
        { version: "4.1.2", build_number: "4120", release_date: "2025-07-09" },
        { version: "4.0.8", build_number: "4080", release_date: "2025-06-14" },
      ],
      ios: [
        { version: "1.2.1", build_number: "121", release_date: "2025-07-13" }, // Tablet
      ],
      android: [
        { version: "1.2.1", build_number: "12100", release_date: "2025-07-14" }, // Tablet
      ],
    },
    pilot: {
      web: [
        {
          version: "4.2.0-pilot.1",
          build_number: "4201",
          release_date: "2025-07-17",
        },
      ],
    },
    uat: {
      web: [
        {
          version: "4.2.1-uat.2",
          build_number: "4212",
          release_date: "2025-07-18",
        },
      ],
    },
    dev: {
      web: [
        {
          version: "4.3.0-dev.6",
          build_number: "4306",
          release_date: "2025-07-19",
        },
      ],
    },
  },
};

// Banking screens and routes
const MOBILE_SCREENS = [
  "Login",
  "Dashboard",
  "AccountBalance",
  "TransferMoney",
  "PayBills",
  "LoanApplication",
  "Settings",
  "TransactionHistory",
  "CustomerSupport",
  "TransferConfirmation",
  "BillPayConfirmation",
  "ProfileSettings",
];

const BRANCH_SCREENS = [
  "CustomerLookup",
  "AccountOpening",
  "TransactionProcessing",
  "LoanProcessing",
  "CustomerService",
  "CashDeposit",
  "CashWithdrawal",
  "AccountMaintenance",
  "KYCVerification",
  "DocumentScanning",
];

const API_ENDPOINTS = [
  "v3/auth/login",
  "v3/accounts/balance",
  "v3/transfer/domestic",
  "v3/transfer/international",
  "v3/bills/pay",
  "v3/loans/apply",
  "v3/transactions/history",
  "v3/customer/profile",
  "v3/kyc/verify",
];

const BRANCH_ENDPOINTS = [
  "v4/branch/customer/lookup",
  "v4/branch/accounts/open",
  "v4/branch/transactions/process",
  "v4/branch/cash/deposit",
  "v4/branch/cash/withdrawal",
  "v4/branch/kyc/update",
];

const CRASH_GROUPS = [
  {
    id: "cg_network_timeout_main",
    type: "NetworkTimeoutException",
    weight: 0.25,
  },
  { id: "cg_auth_failure", type: "AuthenticationException", weight: 0.18 },
  { id: "cg_database_connection", type: "DatabaseException", weight: 0.15 },
  { id: "cg_encryption_error", type: "EncryptionException", weight: 0.12 },
  {
    id: "cg_network_timeout_drc",
    type: "NetworkTimeoutException",
    weight: 0.1,
  },
  { id: "cg_memory_pressure", type: "OutOfMemoryError", weight: 0.08 },
  { id: "cg_ui_thread_block", type: "ANRException", weight: 0.12 },
];

const TRANSACTION_TYPES = [
  "domestic_transfer",
  "international_transfer",
  "bill_payment",
  "loan_payment",
  "mobile_money",
  "card_payment",
];

const ACCOUNT_TYPES = ["savings", "current", "fixed_deposit", "loan"];

//=============================
// HELPER FUNCTIONS
//=============================
function weightedChoice<T>(items: Array<T & { weight: number }>): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * total;

  for (const item of items) {
    random -= item.weight;
    if (random <= 0) return item;
  }
  return items[items.length - 1];
}

function randomChoice<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function logNormal(mean: number, stddev: number): number {
  const normal =
    Math.sqrt(-2 * Math.log(Math.random())) *
    Math.cos(2 * Math.PI * Math.random());
  return Math.exp(Math.log(mean) + stddev * normal);
}

function generateTimestamp(dayOffset: number): {
  timestamp: string;
  day: string;
  hour: number;
} {
  const now = new Date();
  const targetDay = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000);

  // Banking hours weighted distribution (6 AM to 10 PM, peak 9-11 AM and 2-4 PM)
  const hourWeights = [
    1, 1, 1, 1, 1, 2, 4, 8, 12, 18, 15, 12, 8, 10, 16, 12, 8, 6, 4, 3, 2, 1, 1,
    1,
  ];
  const totalWeight = hourWeights.reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;
  let hour = 0;

  for (let i = 0; i < hourWeights.length; i++) {
    random -= hourWeights[i];
    if (random <= 0) {
      hour = i;
      break;
    }
  }

  const minute = Math.floor(Math.random() * 60);
  const second = Math.floor(Math.random() * 60);
  const ms = Math.floor(Math.random() * 1000);

  targetDay.setHours(hour, minute, second, ms);

  return {
    timestamp: targetDay.toISOString(),
    day: targetDay.toISOString().split("T")[0],
    hour,
  };
}

function calculateDuration(
  baseMs: number,
  platform: string,
  deviceTier: string,
  networkType: string,
  country: string
): number {
  let multiplier = 1.0;

  // Network multiplier (African networks can be slower)
  if (networkType === "cellular") multiplier *= 1.5 + Math.random() * 0.8;
  else if (networkType === "wifi") multiplier *= 0.8 + Math.random() * 0.4;
  else if (networkType === "offline") multiplier *= 2.0 + Math.random() * 1.0;

  // Device tier multiplier
  if (deviceTier === "low") multiplier *= 1.4 + Math.random() * 0.4;
  else if (deviceTier === "mid") multiplier *= 1.0 + Math.random() * 0.3;
  else if (deviceTier === "high") multiplier *= 0.8 + Math.random() * 0.2;

  // Country/infrastructure multiplier
  if (["SS", "DRC"].includes(country)) multiplier *= 1.3 + Math.random() * 0.5;
  else if (["UG", "TZ"].includes(country))
    multiplier *= 1.1 + Math.random() * 0.2;

  return Math.max(100, Math.round(logNormal(baseMs * multiplier, 0.6)));
}

function calculateDaysSinceRelease(
  releaseDate: string,
  currentDate: Date
): number {
  const release = new Date(releaseDate);
  const diffTime = currentDate.getTime() - release.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

function shouldCrash(
  version: AppVersion,
  deviceTier: string,
  releaseChannel: string,
  currentDate: Date
): boolean {
  let baseProbability = 0.002; // 0.2% base crash rate (higher for banking due to complexity)

  // Environment multiplier
  if (releaseChannel === "dev") baseProbability *= 4;
  else if (releaseChannel === "uat") baseProbability *= 2.5;
  else if (releaseChannel === "pilot") baseProbability *= 1.8;

  // Device tier multiplier
  if (deviceTier === "low") baseProbability *= 1.6;
  else if (deviceTier === "high") baseProbability *= 0.7;

  // Release spike - crash rates spike in first 7 days after release
  const daysSinceRelease = calculateDaysSinceRelease(
    version.release_date,
    currentDate
  );
  if (daysSinceRelease <= 7) {
    // Exponential decay from 3x multiplier on day 0 to 1x on day 7
    const spikeMultiplier = 1 + 2 * Math.exp(-daysSinceRelease / 3);
    baseProbability *= spikeMultiplier;
  }

  return Math.random() < baseProbability;
}

function chooseVersionForSession(
  appId: string,
  platform: string,
  releaseChannel: string,
  currentDate: Date
): AppVersion {
  const appVersions =
    VERSIONS_WITH_RELEASES[appId as keyof typeof VERSIONS_WITH_RELEASES];
  if (
    !appVersions ||
    !appVersions[releaseChannel as keyof typeof appVersions]
  ) {
    // Fallback
    return {
      version: "1.0.0",
      build_number: "1000",
      release_date: "2025-01-01",
    };
  }

  const platformVersions =
    appVersions[releaseChannel as keyof typeof appVersions][
      platform as keyof any
    ] || [];
  if (platformVersions.length === 0) {
    return {
      version: "1.0.0",
      build_number: "1000",
      release_date: "2025-01-01",
    };
  }

  // Weight versions by adoption curve (newer versions adopted gradually)
  const weightedVersions = platformVersions.map(
    (v: { release_date: string }) => {
      const daysSinceRelease = calculateDaysSinceRelease(
        v.release_date,
        currentDate
      );

      // Adoption curve: slow start, then rapid adoption, then plateau
      let adoptionWeight = 1;
      if (daysSinceRelease <= 3)
        adoptionWeight = 0.1; // Very low adoption first 3 days
      else if (daysSinceRelease <= 7) adoptionWeight = 0.4; // Building adoption
      else if (daysSinceRelease <= 14) adoptionWeight = 0.8; // High adoption
      else if (daysSinceRelease <= 30) adoptionWeight = 1.0; // Peak adoption
      else adoptionWeight = 0.6; // Declining as users move to newer versions

      return { ...v, weight: adoptionWeight };
    }
  );

  return weightedChoice(weightedVersions);
}

function generateSession(dayOffset: number): RawEvent[] {
  const events: RawEvent[] = [];
  const sessionId = `s_banking_${randomUUID().slice(0, 4)}`;

  // Calculate current date for this session
  const currentDate = new Date();
  currentDate.setDate(currentDate.getDate() - dayOffset);

  // Choose country first
  const country = weightedChoice(COUNTRIES);
  const locale = weightedChoice(country.locales); // NEW: Multi-locale support

  // Choose app based on country
  let availableApps = APPS.filter((app) =>
    app.countries.includes(country.code)
  );

  // Branch app has lower probability (staff vs customer ratio)
  const isBranchSession = Math.random() < 0.15;
  if (isBranchSession) {
    availableApps = availableApps.filter((app) => app.isBranchApp);
  } else {
    availableApps = availableApps.filter((app) => !app.isBranchApp);
  }

  if (availableApps.length === 0) return []; // Safety check

  const app = randomChoice(availableApps);
  const platform =
    isBranchSession && Math.random() < 0.8
      ? "web"
      : randomChoice<"ios" | "android" | "web">(["ios", "android", "web"]);
  const device = weightedChoice(DEVICES[platform]);

  const releaseChannel =
    Math.random() < 0.7
      ? "prod"
      : Math.random() < 0.6
      ? "pilot"
      : Math.random() < 0.5
      ? "uat"
      : "dev";

  // NEW: Use version selection with release dates
  const versionInfo = chooseVersionForSession(
    app.id,
    platform,
    releaseChannel,
    currentDate
  );

  const networkType =
    Math.random() < 0.4 ? "wifi" : Math.random() < 0.9 ? "cellular" : "offline";
  const carrier =
    networkType === "cellular" ? randomChoice(country.carriers) : undefined;

  const userId = `u_${country.code.toLowerCase()}_${
    isBranchSession ? "staff" : "customer"
  }_${Math.floor(Math.random() * 10000)}`;

  const osVersion =
    platform === "ios"
      ? `iOS ${16 + Math.floor(Math.random() * 2)}.${Math.floor(
          Math.random() * 6
        )}`
      : platform === "android"
      ? `Android ${11 + Math.floor(Math.random() * 3)}`
      : "Web";

  // Generate banking session events
  const eventCount = Math.max(
    2,
    Math.round(CONFIG.EVENTS_PER_SESSION_AVG + (Math.random() - 0.5) * 4)
  );
  const hasTransaction = !isBranchSession && Math.random() < 0.3; // 30% of customer sessions have transactions

  for (let i = 0; i < eventCount; i++) {
    const timeInfo = generateTimestamp(dayOffset);
    const baseEvent: Partial<RawEvent> = {
      id: `evt_${randomUUID()}`,
      ...timeInfo,
      app_id: app.id,
      app_name: app.name,
      platform,
      release_channel: releaseChannel,
      app_version: versionInfo.version,
      build_number: versionInfo.build_number,
      os_version: osVersion,
      device_model: device.model,
      device_tier: device.tier as "low" | "mid" | "high",
      country: country.code,
      locale: locale.code,
      network_type: networkType as "wifi" | "cellular" | "offline",
      carrier,
      session_id: sessionId,
      user_pseudo_id: userId,
      count: 1,
      revenue_usd: 0,
      is_crash: 0,
      is_fatal: 0,
    };

    // Determine event type
    let eventType: "analytics" | "performance" | "crash";

    if (shouldCrash(versionInfo, device.tier, releaseChannel, currentDate)) {
      eventType = "crash";
    } else if (
      Math.random() <
      CONFIG.ANALYTICS_RATIO /
        (CONFIG.ANALYTICS_RATIO + CONFIG.PERFORMANCE_RATIO)
    ) {
      eventType = "analytics";
    } else {
      eventType = "performance";
    }

    let event: RawEvent;

    if (eventType === "analytics") {
      const screens = isBranchSession ? BRANCH_SCREENS : MOBILE_SCREENS;
      let analyticsEvent: string;
      let screen: string;

      if (isBranchSession) {
        const branchEvents = [
          "customer_account_opened",
          "transaction_processed",
          "kyc_completed",
          "cash_deposit",
          "customer_lookup",
        ];
        analyticsEvent = randomChoice(branchEvents);
        screen = randomChoice(screens);

        event = {
          ...baseEvent,
          source: "analytics",
          event_name: analyticsEvent,
          analytics_event: analyticsEvent,
          screen,
          account_type:
            analyticsEvent === "customer_account_opened"
              ? randomChoice(ACCOUNT_TYPES)
              : undefined,
          branch_code: `${country.code}_${randomChoice([
            "KMP",
            "CBD",
            "IND",
            "RES",
          ])}_${String(Math.floor(Math.random() * 999) + 1).padStart(3, "0")}`,
          value_num:
            analyticsEvent === "customer_account_opened" ? 1 : undefined,
        } as RawEvent;
      } else {
        const customerEvents = [
          "login_success",
          "balance_check",
          "transaction_completed",
          "bill_payment",
          "login_failed",
        ];
        analyticsEvent =
          hasTransaction && i === eventCount - 1
            ? "transaction_completed"
            : randomChoice(customerEvents);
        screen = randomChoice(screens);

        event = {
          ...baseEvent,
          source: "analytics",
          event_name: analyticsEvent,
          analytics_event: analyticsEvent,
          screen,
          transaction_type:
            analyticsEvent === "transaction_completed"
              ? randomChoice(TRANSACTION_TYPES)
              : undefined,
          value_num:
            analyticsEvent === "transaction_completed"
              ? Math.round(logNormal(25000, 1.2))
              : undefined,
          currency:
            analyticsEvent === "transaction_completed"
              ? country.code === "KE"
                ? "KES"
                : country.code === "UG"
                ? "UGX"
                : country.code === "TZ"
                ? "TZS"
                : "USD"
              : undefined,
        } as RawEvent;
      }
    } else if (eventType === "performance") {
      const perfTypes = ["http", "screen", "trace", "app_start"];
      const perfType = randomChoice(perfTypes) as
        | "http"
        | "screen"
        | "trace"
        | "app_start";

      const baseDurations = {
        http: 1200,
        screen: 1800,
        trace: 800,
        app_start: 3000,
      }; // Banking apps are slower
      const duration = calculateDuration(
        baseDurations[perfType],
        platform,
        device.tier,
        networkType,
        country.code
      );

      event = {
        ...baseEvent,
        source: "performance",
        event_name: perfType === "http" ? "api_call" : perfType,
        perf_type: perfType,
        duration_ms: duration,
        success: true,
      } as RawEvent;

      if (perfType === "http") {
        const methods = ["GET", "POST", "PUT"];
        const endpoints = isBranchSession ? BRANCH_ENDPOINTS : API_ENDPOINTS;
        const isError = Math.random() < 0.125; // 12.5% error rate (higher for banking complexity)

        event.http_method = randomChoice(methods);
        event.url_path = randomChoice(endpoints);
        event.status_code = isError
          ? Math.random() < 0.6
            ? 400
            : Math.random() < 0.7
            ? 401
            : 500
          : 200;
        event.success = !isError;
        event.ttfb_ms = Math.round(duration * 0.4); // Higher TTFB for complex banking APIs
        event.payload_bytes = Math.round(logNormal(8000, 0.8)); // Larger payloads for banking data
        event.screen = randomChoice(
          isBranchSession ? BRANCH_SCREENS : MOBILE_SCREENS
        );
      } else if (perfType === "screen") {
        event.screen = randomChoice(
          isBranchSession ? BRANCH_SCREENS : MOBILE_SCREENS
        );
        event.fps_avg = Math.max(
          20,
          Math.round(
            60 -
              (device.tier === "low" ? 30 : device.tier === "mid" ? 15 : 8) +
              Math.random() * 10
          )
        );
      } else if (perfType === "trace") {
        const traces = isBranchSession
          ? [
              "kyc_verification",
              "document_processing",
              "account_validation",
              "cash_counting",
            ]
          : [
              "biometric_auth",
              "transaction_encryption",
              "balance_calculation",
              "risk_assessment",
            ];
        event.trace_name = `banking:${randomChoice(traces)}`;
        event.cpu_ms = Math.round(duration * 0.8); // CPU intensive banking operations
        event.memory_mb = Math.round(logNormal(80, 0.4));
      }
    } else {
      // crash
      const crashGroup = weightedChoice(CRASH_GROUPS);
      const isFatal = Math.random() < 0.12; // 12% fatal crash rate
      const crashTypes =
        platform === "android"
          ? ["fatal", "nonfatal", "anr"]
          : ["fatal", "nonfatal"];

      event = {
        ...baseEvent,
        source: "crash",
        event_name: "crash",
        is_crash: 1,
        is_fatal: isFatal ? 1 : 0,
        crash_type: isFatal
          ? "fatal"
          : (randomChoice(crashTypes.filter((t) => t !== "fatal")) as any),
        exception_type: crashGroup.type,
        crash_group_id: crashGroup.id,
        foreground: Math.random() < 0.9,
      } as RawEvent;
    }

    events.push(event);
  }

  return events;
}

function generateRawEvents(): RawEvent[] {
  const events: RawEvent[] = [];
  const sessionsPerDay = Math.round(
    CONFIG.SESSIONS_PER_DAY * (CONFIG.TOTAL_EVENTS_TARGET / 45000)
  );

  for (let day = 0; day < CONFIG.DATE_RANGE_DAYS; day++) {
    // Weekend reduction for banking
    const isWeekend = day % 7 === 5 || day % 7 === 6;
    const weekendMultiplier = isWeekend ? 0.3 : 1.0;
    const dailySessions = Math.round(
      sessionsPerDay * weekendMultiplier * (0.8 + Math.random() * 0.4)
    );

    for (let session = 0; session < dailySessions; session++) {
      events.push(...generateSession(day));
    }
  }

  // Shuffle events
  for (let i = events.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [events[i], events[j]] = [events[j], events[i]];
  }

  return events.slice(0, CONFIG.TOTAL_EVENTS_TARGET);
}

function generateDailyRollups(rawEvents: RawEvent[]): DailyRollup[] {
  const rollups = new Map<
    string,
    {
      events: RawEvent[];
      users: Set<string>;
      sessions: Set<string>;
    }
  >();

  // Group events by rollup key
  for (const event of rawEvents) {
    const eventGroup =
      event.source === "performance"
        ? `performance:${event.event_name}`
        : event.source === "analytics"
        ? `analytics:${event.analytics_event}`
        : `crash:${event.is_fatal ? "fatal" : "nonfatal"}`;

    const key = `${event.day}|${event.source}|${event.platform}|${event.app_id}|${event.app_version}|${event.release_channel}|${event.country}|${event.device_tier}|${eventGroup}`;

    if (!rollups.has(key)) {
      rollups.set(key, {
        events: [],
        users: new Set(),
        sessions: new Set(),
      });
    }

    const group = rollups.get(key)!;
    group.events.push(event);
    group.users.add(event.user_pseudo_id);
    group.sessions.add(event.session_id);
  }

  // Generate rollup records (same logic as before)
  return Array.from(rollups.entries()).map(([key, group]) => {
    const [
      day,
      source,
      platform,
      app_id,
      app_version,
      release_channel,
      country,
      device_tier,
      event_group,
    ] = key.split("|");

    const durations = group.events
      .map((e) => e.duration_ms)
      .filter((d): d is number => d !== undefined)
      .sort((a, b) => a - b);

    const httpEvents = group.events.filter((e) => e.status_code);
    const httpErrors = httpEvents.filter((e) => e.status_code! >= 400);

    const rollup: DailyRollup = {
      day,
      source,
      platform,
      app_id,
      app_version,
      release_channel,
      country,
      device_tier,
      event_group,
      events_count: group.events.length,
      users_count: group.users.size,
      sessions_count: group.sessions.size,
      revenue_usd: 0, // Banking apps don't directly generate revenue in this context
      purchase_count: 0,
    };

    if (durations.length > 0) {
      rollup.avg_duration_ms = Math.round(
        durations.reduce((a, b) => a + b, 0) / durations.length
      );
      rollup.p50_duration_ms = durations[Math.floor(durations.length * 0.5)];
      rollup.p90_duration_ms = durations[Math.floor(durations.length * 0.9)];
      rollup.p99_duration_ms = durations[Math.floor(durations.length * 0.99)];
    }

    if (httpEvents.length > 0) {
      rollup.http_error_rate = httpErrors.length / httpEvents.length;
    }

    if (source === "crash") {
      rollup.crash_rate_per_1k_sessions =
        (group.events.length / group.sessions.size) * 1000;
    }

    return rollup;
  });
}

//=============================
// DATA VALIDATION CLASS & METHOD
//=============================

class DataValidator {
  private rawEvents: RawEvent[];
  private dailyRollups: DailyRollup[];

  constructor(rawEvents: RawEvent[], dailyRollups: DailyRollup[]) {
    this.rawEvents = rawEvents;
    this.dailyRollups = dailyRollups;
  }

  validateAll(): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      stats: {},
    };

    // Run all validation checks
    this.validateSchema(result);
    this.validateBusinessLogic(result);
    this.validateDistributions(result);
    this.validateTimeSeries(result);
    this.validateRollupAccuracy(result);
    this.validateReleaseLogic(result);

    result.isValid = result.errors.length === 0;
    return result;
  }

  private validateSchema(result: ValidationResult): void {
    console.log("🔍 Validating schema...");

    const requiredFields = [
      "id",
      "source",
      "timestamp",
      "day",
      "hour",
      "app_id",
      "country",
      "platform",
    ];
    let schemaErrors = 0;

    for (let i = 0; i < Math.min(1000, this.rawEvents.length); i++) {
      const event = this.rawEvents[i];

      // Check required fields
      for (const field of requiredFields) {
        if (!(field in event) || event[field as keyof RawEvent] === undefined) {
          result.errors.push(
            `Event ${event.id} missing required field: ${field}`
          );
          schemaErrors++;
        }
      }

      // Check data types and ranges
      if (typeof event.hour !== "number" || event.hour < 0 || event.hour > 23) {
        result.errors.push(`Event ${event.id} invalid hour: ${event.hour}`);
      }

      if (event.count !== 1) {
        result.errors.push(
          `Event ${event.id} count should be 1, got: ${event.count}`
        );
      }

      // Source-specific validations
      if (event.source === "crash" && event.is_crash !== 1) {
        result.errors.push(`Crash event ${event.id} has is_crash !== 1`);
      }

      if (event.source === "performance" && !event.duration_ms) {
        result.errors.push(`Performance event ${event.id} missing duration_ms`);
      }

      if (event.source === "analytics" && !event.analytics_event) {
        result.errors.push(
          `Analytics event ${event.id} missing analytics_event`
        );
      }

      // HTTP specific
      if (event.perf_type === "http") {
        if (!event.status_code || !event.http_method || !event.url_path) {
          result.errors.push(`HTTP event ${event.id} missing HTTP fields`);
        }

        if (event.status_code >= 400 && event.success === true) {
          result.errors.push(
            `HTTP event ${event.id} has error status but success=true`
          );
        }
      }
    }

    result.stats.schemaErrors = schemaErrors;
    if (schemaErrors === 0) console.log("✅ Schema validation passed");
  }

  private validateBusinessLogic(result: ValidationResult): void {
    console.log("🏦 Validating banking business logic...");

    // App-country consistency
    const appCountryViolations = this.rawEvents.filter((event) => {
      const app = APPS.find((a) => a.id === event.app_id);
      return app && !app.countries.includes(event.country);
    });

    if (appCountryViolations.length > 0) {
      result.errors.push(
        `${appCountryViolations.length} events have app-country mismatches`
      );
    }

    // Release channel version patterns
    const devVersions = this.rawEvents.filter(
      (e) => e.release_channel === "dev" && !e.app_version.includes("dev")
    );
    if (devVersions.length > 0) {
      result.warnings.push(
        `${devVersions.length} dev channel events without 'dev' in version`
      );
    }

    // Crash rate sanity check
    const totalSessions = new Set(this.rawEvents.map((e) => e.session_id)).size;
    const crashingSessions = new Set(
      this.rawEvents.filter((e) => e.is_crash === 1).map((e) => e.session_id)
    ).size;
    const crashRate = crashingSessions / totalSessions;

    if (crashRate > 0.1) {
      result.warnings.push(
        `High overall crash rate: ${(crashRate * 100).toFixed(2)}%`
      );
    }

    result.stats.crashRate = crashRate;
    result.stats.appCountryViolations = appCountryViolations.length;
  }

  private validateDistributions(result: ValidationResult): void {
    console.log("📊 Validating distributions...");

    // Source ratio validation
    const sourceStats = this.rawEvents.reduce((acc, e) => {
      acc[e.source] = (acc[e.source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const total = this.rawEvents.length;
    const analyticsRatio = sourceStats.analytics / total;
    const performanceRatio = sourceStats.performance / total;
    const crashRatio = sourceStats.crash / total;

    // Check against CONFIG expectations (±10% tolerance)
    if (Math.abs(analyticsRatio - CONFIG.ANALYTICS_RATIO) > 0.1) {
      result.warnings.push(
        `Analytics ratio ${analyticsRatio.toFixed(2)} differs from expected ${
          CONFIG.ANALYTICS_RATIO
        }`
      );
    }

    if (Math.abs(crashRatio - CONFIG.PERFORMANCE_RATIO) > 0.1) {
      result.warnings.push(
        `Performance ratio ${performanceRatio.toFixed(
          3
        )} differs from expected ${CONFIG.PERFORMANCE_RATIO}`
      );
    }

    if (Math.abs(crashRatio - CONFIG.CRASH_RATIO) > 0.02) {
      result.warnings.push(
        `Crash ratio ${crashRatio.toFixed(3)} differs from expected ${
          CONFIG.CRASH_RATIO
        }`
      );
    }

    // Country distribution validation
    const countryStats = this.rawEvents.reduce((acc, e) => {
      acc[e.country] = (acc[e.country] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    for (const country of COUNTRIES) {
      const actualRatio = (countryStats[country.code] || 0) / total;
      if (Math.abs(actualRatio - country.weight) > 0.1) {
        result.warnings.push(
          `Country ${country.code} ratio ${actualRatio.toFixed(
            2
          )} differs from expected ${country.weight}`
        );
      }
    }

    // Locale validation
    const localeStats = this.rawEvents.reduce((acc, e) => {
      acc[e.locale] = (acc[e.locale] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const validLocales = ["EN", "SW", "RW", "FR", "ZH"];
    const invalidLocales = Object.keys(localeStats).filter(
      (l) => !validLocales.includes(l)
    );
    if (invalidLocales.length > 0) {
      result.errors.push(`Invalid locales found: ${invalidLocales.join(", ")}`);
    }

    result.stats.distributions = {
      sources: sourceStats,
      countries: countryStats,
      locales: localeStats,
    };
  }

  private validateTimeSeries(result: ValidationResult): void {
    console.log("⏰ Validating time series...");

    // Check date ranges
    const dates = this.rawEvents.map((e) => new Date(e.timestamp).getTime());
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    const daySpan =
      (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daySpan > CONFIG.DATE_RANGE_DAYS + 5) {
      // +5 days tolerance
      result.warnings.push(
        `Date range ${daySpan.toFixed(0)} days exceeds expected ${
          CONFIG.DATE_RANGE_DAYS
        }`
      );
    }

    // Check day-hour consistency
    const timeInconsistencies = this.rawEvents.filter((e) => {
      const eventDate = new Date(e.timestamp);
      return (
        eventDate.getUTCHours() !== e.hour ||
        eventDate.toISOString().split("T")[0] !== e.day
      );
    });

    if (timeInconsistencies.length > 0) {
      result.warnings.push(
        `${timeInconsistencies.length} events have timestamp-day-hour inconsistencies`
      );
    }

    // Weekend pattern validation (banking should have reduced weekend activity)
    const dayOfWeekStats = this.rawEvents.reduce((acc, e) => {
      const dayOfWeek = new Date(e.timestamp).getUTCDay(); // 0=Sunday, 6=Saturday
      acc[dayOfWeek] = (acc[dayOfWeek] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    const weekdayAvg =
      [1, 2, 3, 4, 5].reduce(
        (sum, day) => sum + (dayOfWeekStats[day] || 0),
        0
      ) / 5;
    const weekendAvg =
      [0, 6].reduce((sum, day) => sum + (dayOfWeekStats[day] || 0), 0) / 2;

    if (weekendAvg > weekdayAvg * 0.8) {
      // Weekend should be <80% of weekday
      result.warnings.push(
        `Weekend activity too high: ${weekendAvg.toFixed(
          0
        )} vs weekday ${weekdayAvg.toFixed(0)}`
      );
    }

    result.stats.timeSeries = {
      dateRange: {
        min: minDate.toISOString().split("T")[0],
        max: maxDate.toISOString().split("T")[0],
      },
      daySpan,
      timeInconsistencies: timeInconsistencies.length,
      dayOfWeekStats,
    };
  }

  private validateRollupAccuracy(result: ValidationResult): void {
    console.log("🔄 Validating rollup accuracy...");

    // Sample check: verify a few rollups match their raw data
    const sampleRollups = this.dailyRollups.slice(0, 10);
    let rollupErrors = 0;

    for (const rollup of sampleRollups) {
      // Find matching raw events
      const matchingEvents = this.rawEvents.filter(
        (e) =>
          e.day === rollup.day &&
          e.source === rollup.source &&
          e.platform === rollup.platform &&
          e.app_id === rollup.app_id &&
          e.app_version === rollup.app_version &&
          e.release_channel === rollup.release_channel &&
          e.country === rollup.country &&
          e.device_tier === rollup.device_tier
      );

      if (matchingEvents.length !== rollup.events_count) {
        result.warnings.push(
          `Rollup events_count mismatch: expected ${matchingEvents.length}, got ${rollup.events_count}`
        );
        rollupErrors++;
      }

      // Check unique users/sessions
      const uniqueUsers = new Set(matchingEvents.map((e) => e.user_pseudo_id))
        .size;
      const uniqueSessions = new Set(matchingEvents.map((e) => e.session_id))
        .size;

      if (uniqueUsers !== rollup.users_count) {
        result.warnings.push(
          `Rollup users_count mismatch: expected ${uniqueUsers}, got ${rollup.users_count}`
        );
        rollupErrors++;
      }

      if (uniqueSessions !== rollup.sessions_count) {
        result.warnings.push(
          `Rollup sessions_count mismatch: expected ${uniqueSessions}, got ${rollup.sessions_count}`
        );
        rollupErrors++;
      }
    }

    result.stats.rollupErrors = rollupErrors;
    if (rollupErrors === 0) console.log("✅ Rollup accuracy validation passed");
  }

  private validateReleaseLogic(result: ValidationResult): void {
    console.log("🚀 Validating release logic...");

    // Check that newer releases have lower adoption in early days
    const releaseAdoptionIssues: Array<string> = [];

    // Group events by app-platform-channel
    const versionGroups = this.rawEvents.reduce((acc, e) => {
      const key = `${e.app_id}-${e.platform}-${e.release_channel}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(e);
      return acc;
    }, {} as Record<string, RawEvent[]>);

    for (const [groupKey, events] of Object.entries(versionGroups)) {
      const versionStats = events.reduce((acc, e) => {
        if (!acc[e.app_version]) acc[e.app_version] = [];
        acc[e.app_version].push(e);
        return acc;
      }, {} as Record<string, RawEvent[]>);

      // Check adoption patterns for recent versions
      for (const [version, versionEvents] of Object.entries(versionStats)) {
        if (version.includes("dev") || version.includes("uat")) {
          const avgEventsPerDay = versionEvents.length / CONFIG.DATE_RANGE_DAYS;

          // Dev/UAT versions shouldn't be too prevalent
          if (
            avgEventsPerDay >
            (events.length / CONFIG.DATE_RANGE_DAYS) * 0.3
          ) {
            releaseAdoptionIssues.push(
              `${groupKey} version ${version} has unexpectedly high adoption`
            );
          }
        }
      }
    }

    if (releaseAdoptionIssues.length > 0) {
      result.warnings.push(
        `Release adoption issues: ${releaseAdoptionIssues.join("; ")}`
      );
    }

    result.stats.releaseAdoptionIssues = releaseAdoptionIssues.length;
  }
}

function validateGeneratedData(
  rawEvents: RawEvent[],
  dailyRollups: DailyRollup[]
): void {
  console.log("\n🔍 VALIDATING GENERATED DATA...\n");

  const validator = new DataValidator(rawEvents, dailyRollups);
  const validationResult = validator.validateAll();

  console.log("\n📋 VALIDATION SUMMARY:");
  console.log(`✅ Valid: ${validationResult.isValid}`);
  console.log(`❌ Errors: ${validationResult.errors.length}`);
  console.log(`⚠️  Warnings: ${validationResult.warnings.length}`);

  if (validationResult.errors.length > 0) {
    console.log("\n❌ ERRORS:");
    validationResult.errors.forEach((error) => console.log(`   ${error}`));
  }

  if (validationResult.warnings.length > 0) {
    console.log("\n⚠️  WARNINGS:");
    validationResult.warnings.forEach((warning) =>
      console.log(`   ${warning}`)
    );
  }

  console.log("\n📊 KEY STATS:");
  console.log(`   Total events: ${rawEvents.length}`);
  console.log(`   Total rollups: ${dailyRollups.length}`);
  console.log(
    `   Unique sessions: ${new Set(rawEvents.map((e) => e.session_id)).size}`
  );
  console.log(
    `   Unique users: ${new Set(rawEvents.map((e) => e.user_pseudo_id)).size}`
  );
  console.log(
    `   Date range: ${validationResult.stats.timeSeries?.dateRange?.min} to ${validationResult.stats.timeSeries?.dateRange?.max}`
  );
  console.log(
    `   Overall crash rate: ${(validationResult.stats.crashRate * 100).toFixed(
      2
    )}%`
  );

  // Distribution summary
  if (validationResult.stats.distributions) {
    console.log("\n📈 DISTRIBUTIONS:");
    console.log(
      "   Sources:",
      Object.entries(validationResult.stats.distributions.sources)
        .map(
          ([k, v]) =>
            `${k}: ${(((v as number) / rawEvents.length) * 100).toFixed(1)}%`
        )
        .join(", ")
    );
    console.log(
      "   Top countries:",
      Object.entries(validationResult.stats.distributions.countries)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 3)
        .map(
          ([k, v]) =>
            `${k}: ${(((v as number) / rawEvents.length) * 100).toFixed(1)}%`
        )
        .join(", ")
    );
    console.log(
      "   Locales:",
      Object.entries(validationResult.stats.distributions.locales)
        .map(
          ([k, v]) =>
            `${k}: ${(((v as number) / rawEvents.length) * 100).toFixed(1)}%`
        )
        .join(", ")
    );
  }

  // Save validation report
  writeFileSync(
    "data/validation_report.json",
    JSON.stringify(validationResult, null, 2)
  );
  console.log("\n💾 Validation report saved to data/validation_report.json");

  if (!validationResult.isValid) {
    console.log("\n❌ DATA VALIDATION FAILED - Review errors above");
    process.exit(1);
  } else {
    console.log("\n✅ DATA VALIDATION PASSED");
  }
}

//=============================
// GENERATE, VALIDATE AND SAVE DATA
//=============================
console.log("🏦 Generating banking application data...");
const rawEvents = generateRawEvents();
console.log(`Generated ${rawEvents.length} raw events`);

const dailyRollups = generateDailyRollups(rawEvents);
console.log(`Generated ${dailyRollups.length} daily rollups`);

console.log("raw events", existsSync("data/raw_events.json"));
console.log("daily rollups", existsSync("data/daily_rollups.json"));
if (
  !existsSync("data/raw_events.json") &&
  !existsSync("data/daily_rollups.json") &&
  !existsSync("data/validation_report.json")
)
  mkdirSync("data");

writeFileSync("data/raw_events.json", JSON.stringify(rawEvents, null, 2));
writeFileSync("data/daily_rollups.json", JSON.stringify(dailyRollups, null, 2));

validateGeneratedData(rawEvents, dailyRollups);

console.log('✅ Data generation and validation complete!')

// Banking-specific stats
const appStats = rawEvents.reduce((acc, e) => {
  acc[e.app_id] = (acc[e.app_id] || 0) + 1;
  return acc;
}, {} as Record<string, number>);

const countryStats = rawEvents.reduce((acc, e) => {
  acc[e.country] = (acc[e.country] || 0) + 1;
  return acc;
}, {} as Record<string, number>);

console.log(
  "🏦 App distribution:",
  Object.entries(appStats)
    .map(([k, v]) => `${k}: ${Math.round((v / rawEvents.length) * 100)}%`)
    .join(", ")
);
console.log(
  "🌍 Country distribution:",
  Object.entries(countryStats)
    .map(([k, v]) => `${k}: ${Math.round((v / rawEvents.length) * 100)}%`)
    .join(", ")
);
