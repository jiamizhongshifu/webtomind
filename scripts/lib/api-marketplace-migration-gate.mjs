import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MARKETPLACE_FUNCTION_HINTS = [
  ["reserve_api_wallet", "reserve_api_wallet_shared"],
  ["settle_api_usage", "settle_api_usage"],
  ["expire_stale_api_usage", "expire_stale_api_usage"],
  ["queue_api_usage_settlement", "queue_api_usage_settlement"],
  ["process_api_usage_settlement_queue", "process_api_usage_settlement_queue"]
];

function readMarketplaceMigrations(migrationsDir) {
  const files = readdirSync(migrationsDir)
    .filter((name) => /^\d{14}_api_marketplace.*\.sql$/.test(name))
    .sort();
  return files.map((name) => ({
    name,
    timestamp: Number(name.slice(0, 14)),
    content: readFileSync(join(migrationsDir, name), "utf8")
  }));
}
export function assessApiMarketplaceMigrationGate(root = process.cwd()) {
  const errors = [];
  let migrations;
  try {
    migrations = readMarketplaceMigrations(join(root, "supabase/migrations"));
  } catch (error) {
    return {
      ok: false,
      errors: ["unable to read migrations: " + error.message],
      migrations: []
    };
  }
  if (migrations.length === 0) {
    return { ok: false, errors: ["no marketplace migrations found"], migrations: [] };
  }
  let previousTimestamp = 0;
  for (const migration of migrations) {
    if (!Number.isFinite(migration.timestamp)) {
      errors.push(migration.name + ": invalid timestamp prefix");
      continue;
    }
    if (migration.timestamp === previousTimestamp) {
      errors.push(migration.name + ": duplicate timestamp breaks supabase migration ordering");
    }
    previousTimestamp = Math.max(previousTimestamp, migration.timestamp);
  }
  // Supabase re-runs CREATE OR REPLACE in file order, so the newest definition
  // is whatever the last containing migration says. Verify every core function
  // still exists there after future refactors.
  for (const [fnName, marker] of MARKETPLACE_FUNCTION_HINTS) {
    const owner = [...migrations].reverse().find((item) => item.content.includes(fnName));
    if (!owner) {
      errors.push(fnName + ": not defined in any marketplace migration");
      continue;
    }
    if (!owner.content.includes(marker)) {
      errors.push(fnName + ": latest defining migration " + owner.name + " no longer contains marker " + marker);
    }
  }
  return { ok: errors.length === 0, errors, migrations: migrations.map((m) => m.name) };
}
