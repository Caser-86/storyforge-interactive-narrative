interface MemoryTable {
  rows: Record<string, unknown>[];
}

interface MemoryDb {
  tables: Map<string, MemoryTable>;
  migrations: number[];
}

const GLOBAL_KEY = "__NARRATIVE_GAME_MEMORY_DB__";

function getMemoryDb(): MemoryDb {
  if (!(global as unknown as Record<string, MemoryDb>)[GLOBAL_KEY]) {
    (global as unknown as Record<string, MemoryDb>)[GLOBAL_KEY] = {
      tables: new Map(),
      migrations: [],
    };
  }
  return (global as unknown as Record<string, MemoryDb>)[GLOBAL_KEY];
}

const memoryDb = getMemoryDb();

function getTable(tableName: string): MemoryTable {
  if (!memoryDb.tables.has(tableName)) {
    memoryDb.tables.set(tableName, { rows: [] });
  }
  return memoryDb.tables.get(tableName)!;
}

function parseSqlInsert(sql: string, params: unknown[]): { table: string; row: Record<string, unknown> } {
  const match = sql.match(/INSERT INTO (\w+)\s*\(([^)]+)\)/i);
  if (!match) {
    throw new Error("Cannot parse INSERT statement");
  }

  const tableName = match[1];
  const columns = match[2].split(",").map((c) => c.trim());

  const row: Record<string, unknown> = {};
  columns.forEach((col, idx) => {
    row[col] = params[idx];
  });

  return { table: tableName, row };
}

function parseSqlUpdate(sql: string, params: unknown[]): { table: string; set: Record<string, unknown>; where: Record<string, unknown>; whereNull: string[] } {
  const tableMatch = sql.match(/UPDATE (\w+)/i);
  const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i);
  const whereMatch = sql.match(/WHERE\s+(.+?)(?=\s+RETURNING|\s*$)/i);

  if (!tableMatch || !setMatch) {
    throw new Error("Cannot parse UPDATE statement");
  }

  const tableName = tableMatch[1];
  const setParts = setMatch[1].split(",").map((p) => p.trim());
  
  const whereParts: string[] = [];
  const whereNull: string[] = [];
  if (whereMatch) {
    const whereStr = whereMatch[1];
    const parts = whereStr.split(/\s+AND\s+/i).map((p) => p.trim());
    parts.forEach((part) => {
      if (part.match(/\s+IS\s+NULL/i)) {
        const colName = part.split(/\s+/)[0];
        whereNull.push(colName);
      } else {
        whereParts.push(part);
      }
    });
  }

  const set: Record<string, unknown> = {};
  const where: Record<string, unknown> = {};

  let paramIdx = 0;
  setParts.forEach((part) => {
    if (part.match(/=\s*NOW\(\)/i)) {
      const colName = part.split(/\s*=\s*/)[0];
      set[colName] = new Date().toISOString();
    } else {
      const colMatch = part.match(/^(\w+)\s*=\s*\$/);
      if (colMatch) {
        set[colMatch[1]] = params[paramIdx++];
      }
    }
  });

  whereParts.forEach((part) => {
    const colMatch = part.match(/^(\w+)\s*=\s*\$/);
    if (colMatch) {
      where[colMatch[1]] = params[paramIdx++];
    }
  });

  return { table: tableName, set, where, whereNull };
}

function parseSqlSelect(sql: string, params: unknown[]): { table: string; where?: Record<string, unknown>; orderBy?: string } {
  const tableMatch = sql.match(/FROM (\w+)/i);
  const whereMatch = sql.match(/WHERE\s+(.+?)(?=\s+ORDER|\s+LIMIT|$)/i);
  const orderByMatch = sql.match(/ORDER BY\s+(\w+)/i);

  if (!tableMatch) {
    throw new Error("Cannot parse SELECT statement");
  }

  const tableName = tableMatch[1];
  const where: Record<string, unknown> = {};

  if (whereMatch) {
    const whereParts = whereMatch[1].split(/\s+AND\s+/i).map((p) => p.trim());
    let paramIdx = 0;
    whereParts.forEach((part) => {
      const colMatch = part.match(/^(\w+)\s*=\s*\$/);
      if (colMatch) {
        where[colMatch[1]] = params[paramIdx++];
      }
    });
  }

  return { table: tableName, where, orderBy: orderByMatch ? orderByMatch[1] : undefined };
}

export async function memoryQuery(text: string, params: unknown[] = []): Promise<{ rows: Record<string, unknown>[]; duration: number }> {
  const start = Date.now();
  text = text.trim();

  if (text.startsWith("INSERT")) {
    const { table, row } = parseSqlInsert(text, params);
    const tableData = getTable(table);
    tableData.rows.push(row);
    return { rows: [], duration: Date.now() - start };
  }

  if (text.startsWith("UPDATE")) {
    const { table, set, where, whereNull } = parseSqlUpdate(text, params);
    const tableData = getTable(table);
    const updatedRows: Record<string, unknown>[] = [];
    tableData.rows = tableData.rows.map((r) => {
      let match = true;
      for (const [key, value] of Object.entries(where)) {
        if (r[key] !== value) {
          match = false;
          break;
        }
      }
      for (const colName of whereNull) {
        if (r[colName] !== undefined && r[colName] !== null) {
          match = false;
          break;
        }
      }
      if (match) {
        const updatedRow = { ...r, ...set };
        updatedRows.push(updatedRow);
        return updatedRow;
      }
      return r;
    });
    if (text.includes("RETURNING")) {
      return { rows: updatedRows, duration: Date.now() - start };
    }
    return { rows: [], duration: Date.now() - start };
  }

  if (text.startsWith("SELECT")) {
    const { table, where, orderBy } = parseSqlSelect(text, params);
    const tableData = getTable(table);
    let rows = [...tableData.rows];

    if (where) {
      rows = rows.filter((r) => {
        for (const [key, value] of Object.entries(where)) {
          if (r[key] !== value) return false;
        }
        return true;
      });
    }

    if (orderBy) {
      rows.sort((a, b) => {
        const aVal = a[orderBy];
        const bVal = b[orderBy];
        if (typeof aVal === "number" && typeof bVal === "number") {
          return aVal - bVal;
        }
        return String(aVal).localeCompare(String(bVal));
      });
    }

    return { rows, duration: Date.now() - start };
  }

  if (text.startsWith("CREATE TABLE")) {
    const match = text.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
    if (match) {
      getTable(match[1]);
    }
    return { rows: [], duration: Date.now() - start };
  }

  if (text.startsWith("CREATE INDEX")) {
    return { rows: [], duration: Date.now() - start };
  }

  if (text.startsWith("ALTER TABLE")) {
    return { rows: [], duration: Date.now() - start };
  }

  if (text.startsWith("BEGIN") || text.startsWith("COMMIT") || text.startsWith("ROLLBACK")) {
    return { rows: [], duration: Date.now() - start };
  }

  console.warn("[MemoryDB] Unhandled SQL:", text.slice(0, 50));
  return { rows: [], duration: Date.now() - start };
}

export async function memoryWithTransaction<T>(callback: (client: { query: typeof memoryQuery }) => Promise<T>): Promise<T> {
  return callback({ query: memoryQuery });
}

export async function memoryInitDb(): Promise<void> {
  const globalObj = global as unknown as Record<string, boolean>;
  const initializedKey = "__NARRATIVE_GAME_MEMORY_DB_INITIALIZED__";
  
  if (globalObj[initializedKey]) {
    return;
  }
  memoryDb.migrations = [1, 2, 3, 4, 5, 6, 7, 8];
  globalObj[initializedKey] = true;
  console.log("[MemoryDB] Initialized with mock migrations");
}

export const isMemoryMode = process.env.DISABLE_REDIS === "true" || !process.env.DATABASE_URL;
