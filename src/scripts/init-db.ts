import { query, initDb } from "../lib/db";

async function main() {
  console.log("Initializing database...");
  await initDb();
  console.log("Database initialized successfully.");

  const result = await query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
  );
  console.log(
    "Tables:",
    result.rows.map((r) => r.table_name).join(", ")
  );

  process.exit(0);
}

main().catch((err) => {
  console.error("Database init failed:", err);
  process.exit(1);
});
