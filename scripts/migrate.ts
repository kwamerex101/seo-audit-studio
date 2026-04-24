#!/usr/bin/env tsx
import { runMigration } from "../server/lib/migrate/import-outputs";

async function main() {
  console.log("[migrate] scanning legacy outputs…");
  const result = await runMigration();
  console.log(`[migrate] imported=${result.imported} skipped=${result.skipped}`);
  for (const d of result.details) {
    console.log(
      `  ${d.skipped ? "skip" : "new "}  ${d.slug}  audit=${d.audit_id}`,
    );
  }
  if (result.imported === 0 && result.skipped === 0) {
    console.warn(
      "[migrate] nothing found. Ensure ai_agent/outputs/ exists or set LEGACY_OUTPUTS_DIR.",
    );
  }
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
