import { afterEach, expect, it } from "vitest";
import { closeSqlite, sqliteQuery } from "@/lib/db/sqlite";

afterEach(() => closeSqlite());

it("propagates malformed SQL instead of returning empty rows", async () => {
  await expect(sqliteQuery("SELEC definitely_invalid")).rejects.toThrow(
    /near "SELEC": syntax error/
  );
});

it("allows VACUUM without treating it as a row-returning query", async () => {
  await expect(sqliteQuery("VACUUM")).resolves.toMatchObject({ rows: [] });
});

it("allows ANALYZE without treating it as a row-returning query", async () => {
  await expect(sqliteQuery("ANALYZE")).resolves.toMatchObject({ rows: [] });
});
