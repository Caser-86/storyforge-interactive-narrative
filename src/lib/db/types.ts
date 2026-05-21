// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbRow = Record<string, any>;

export interface QueryResult {
  rows: DbRow[];
  duration: number;
}

export type QueryFn = (text: string, params?: unknown[]) => Promise<QueryResult>;

export type StorageDriverType = "memory" | "sqlite" | "postgres";

export interface StorageDriverInfo {
  driver: StorageDriverType;
  persistent: boolean;
  path?: string;
}

export function getStorageDriver(): StorageDriverType {
  if (process.env.USE_MEMORY_DB === "true") {
    return "memory";
  }
  if (process.env.STORAGE_DRIVER) {
    const d = process.env.STORAGE_DRIVER.toLowerCase();
    if (d === "memory" || d === "sqlite" || d === "postgres") {
      return d;
    }
  }
  if (process.env.DATABASE_URL) {
    return "postgres";
  }
  return "sqlite";
}

export function getStorageDriverInfo(): StorageDriverInfo {
  const driver = getStorageDriver();
  switch (driver) {
    case "memory":
      return { driver: "memory", persistent: false };
    case "sqlite":
      return {
        driver: "sqlite",
        persistent: true,
        path: process.env.SQLITE_DB_PATH || "./data/storyforge.sqlite",
      };
    case "postgres":
      return { driver: "postgres", persistent: true, path: process.env.DATABASE_URL };
  }
}
