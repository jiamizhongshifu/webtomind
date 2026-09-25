import { assessApiMarketplaceMigrationGate } from "./lib/api-marketplace-migration-gate.mjs";

const result = assessApiMarketplaceMigrationGate();
if (!result.ok) {
  console.error("[api-marketplace-migration-gate] FAILED");
  for (const error of result.errors) console.error(" - " + error);
  process.exit(1);
}
console.log(
  "[api-marketplace-migration-gate] passed (" + result.migrations.length + " migrations)"
);
