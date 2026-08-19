import { afterEach, expect, it } from "vitest";
import { closeSqlite, sqliteQuery } from "@/lib/db/sqlite";

afterEach(() => closeSqlite());

it("propagates malformed SQL instead of returning empty rows", async () => {
  await expect(sqliteQuery("SELEC definitely_invalid")).rejects.toThrow();
});
