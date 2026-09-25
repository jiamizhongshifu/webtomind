import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assessApiMarketplaceMigrationGate } from "./lib/api-marketplace-migration-gate.mjs";

function buildFixtureMigrations(files) {
  const root = mkdtempSync(join(tmpdir(), "wtm-mig-gate-"));
  const dir = join(root, "supabase", "migrations");
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return root;
}

test("passes the real marketplace migrations", () => {
  const result = assessApiMarketplaceMigrationGate();
  assert.equal(result.ok, true, result.errors.join("; "));
});

test("rejects duplicate timestamps", () => {
  const root = buildFixtureMigrations({
    "20260825090000_api_marketplace.sql": "reserve_api_wallet_shared",
    "20260825090000_api_marketplace_dupe.sql": "x",
    "20260825089999_api_marketplace_old.sql": "y"
  });
  try {
    const result = assessApiMarketplaceMigrationGate(root);
    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /duplicate timestamp/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("requires the latest definition of every core function", () => {
  const root = buildFixtureMigrations({
    "20260825090000_api_marketplace.sql": ["reserve_api_wallet_shared settle_api_usage expire_stale_api_usage queue_api_usage_settlement process_api_usage_settlement_queue"].join(" ")
  });
  try {
    const result = assessApiMarketplaceMigrationGate(root);
    assert.equal(result.ok, true, result.errors.join("; "));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
