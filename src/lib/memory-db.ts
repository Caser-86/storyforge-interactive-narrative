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

interface ParsedSelect {
  columns: string[];
  table: string;
  alias?: string;
  join?: { table: string; alias: string; on: { leftCol: string; rightCol: string; leftAlias: string; rightAlias: string } };
  where: Record<string, unknown>;
  whereNotNull: string[];
  computedColumns: Record<string, { expr: string; col: string }>;
  orderBy?: string;
  limit?: number;
}

function parseSqlSelect(sql: string, params: unknown[]): ParsedSelect {
  const fromMatch = sql.match(/FROM\s+(\w+)(?:\s+(\w+))?/i);
  if (!fromMatch) {
    if (/^\s*SELECT\s+\d+\s*$/i.test(sql)) {
      return { columns: ["1"], table: "__dual__", where: {}, whereNotNull: [], computedColumns: {} };
    }
    throw new Error("Cannot parse SELECT statement: no FROM");
  }

  const table = fromMatch[1];
  const alias = fromMatch[2] && fromMatch[2].toUpperCase() !== "WHERE" && fromMatch[2].toUpperCase() !== "JOIN" && fromMatch[2].toUpperCase() !== "ORDER" && fromMatch[2].toUpperCase() !== "LIMIT"
    ? fromMatch[2]
    : undefined;

  const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM/i);
  const rawColumns = selectMatch ? selectMatch[1] : "*";

  const columns: string[] = [];
  const computedColumns: Record<string, { expr: string; col: string }> = {};

  if (rawColumns.trim() === "*") {
    columns.push("*");
  } else {
    rawColumns.split(",").forEach((part) => {
      const trimmed = part.trim();
      const asMatch = trimmed.match(/^(.+?)\s+AS\s+(\w+)$/i);
      if (asMatch) {
        const expr = asMatch[1].trim();
        const aliasName = asMatch[2].trim();
        const isNotNullMatch = expr.match(/^\(?(\w+)\.(\w+)\s+IS\s+NOT\s+NULL\)?$/i);
        if (isNotNullMatch) {
          computedColumns[aliasName] = { expr: "IS_NOT_NULL", col: isNotNullMatch[2] };
        } else {
          const colOnly = expr.match(/^(\w+)\.(\w+)$/);
          if (colOnly) {
            columns.push(colOnly[2]);
          } else {
            columns.push(expr);
          }
        }
      } else {
        const colOnly = trimmed.match(/^(\w+)\.(\w+)$/);
        if (colOnly) {
          columns.push(colOnly[2]);
        } else {
          columns.push(trimmed);
        }
      }
    });
  }

  const joinMatch = sql.match(/JOIN\s+(\w+)\s+(\w+)\s+ON\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/i);
  const join = joinMatch ? {
    table: joinMatch[1],
    alias: joinMatch[2],
    on: {
      leftCol: joinMatch[4],
      rightCol: joinMatch[6],
      leftAlias: joinMatch[3],
      rightAlias: joinMatch[5],
    },
  } : undefined;

  const whereMatch = sql.match(/WHERE\s+(.+?)(?=\s+ORDER|\s+LIMIT|$)/i);
  const where: Record<string, unknown> = {};
  const whereNotNull: string[] = [];

  if (whereMatch) {
    let paramIdx = 0;
    const whereParts = whereMatch[1].split(/\s+AND\s+/i).map((p) => p.trim());
    whereParts.forEach((part) => {
      const isNotNullMatch = part.match(/^(\w+)\.(\w+)\s+IS\s+NOT\s+NULL$/i);
      if (isNotNullMatch) {
        whereNotNull.push(isNotNullMatch[2]);
        return;
      }
      const colMatch = part.match(/^(?:\w+\.)?(\w+)\s*=\s*\$/);
      if (colMatch) {
        where[colMatch[1]] = params[paramIdx++];
      }
    });
  }

  const orderByMatch = sql.match(/ORDER BY\s+(?:\w+\.)?(\w+)(?:\s+(ASC|DESC))?/i);
  const orderBy = orderByMatch ? orderByMatch[1] : undefined;

  const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
  const limit = limitMatch ? parseInt(limitMatch[1], 10) : undefined;

  return { columns, table, alias, join, where, whereNotNull, computedColumns, orderBy, limit };
}

function resolveColumnName(col: string, alias?: string): string {
  if (alias && col.startsWith(alias + ".")) {
    return col.slice(alias.length + 1);
  }
  return col;
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
    const parsed = parseSqlSelect(text, params);
    if (parsed.table === "__dual__") {
      return { rows: [{ "1": 1 }], duration: Date.now() - start };
    }
    const tableData = getTable(parsed.table);
    let rows: Record<string, unknown>[] = [];

    if (parsed.join) {
      const joinTableData = getTable(parsed.join.table);
      const mainAlias = parsed.alias || parsed.table;
      const joinAlias = parsed.join.alias;

      for (const mainRow of tableData.rows) {
        for (const joinRow of joinTableData.rows) {
          const leftVal = mainRow[resolveColumnName(parsed.join.on.leftCol, mainAlias === parsed.join.on.leftAlias ? mainAlias : joinAlias)];
          const rightVal = joinRow[resolveColumnName(parsed.join.on.rightCol, joinAlias === parsed.join.on.rightAlias ? joinAlias : mainAlias)];

          if (leftVal === rightVal) {
            const merged: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(mainRow)) {
              merged[k] = v;
            }
            for (const [k, v] of Object.entries(joinRow)) {
              if (!(k in merged)) {
                merged[k] = v;
              }
            }
            rows.push(merged);
          }
        }
      }
    } else {
      rows = [...tableData.rows];
    }

    if (Object.keys(parsed.where).length > 0 || parsed.whereNotNull.length > 0) {
      rows = rows.filter((r) => {
        for (const [key, value] of Object.entries(parsed.where)) {
          if (r[key] !== value) return false;
        }
        for (const colName of parsed.whereNotNull) {
          if (r[colName] === undefined || r[colName] === null) return false;
        }
        return true;
      });
    }

    if (parsed.orderBy) {
      const dir = (text.match(/ORDER BY\s+(?:\w+\.)?(\w+)(?:\s+(ASC|DESC))?/i)?.[2]?.toUpperCase() === "DESC") ? -1 : 1;
      rows.sort((a, b) => {
        const aVal = a[parsed.orderBy!];
        const bVal = b[parsed.orderBy!];
        if (typeof aVal === "number" && typeof bVal === "number") {
          return (aVal - bVal) * dir;
        }
        return String(aVal ?? "").localeCompare(String(bVal ?? "")) * dir;
      });
    }

    if (parsed.limit) {
      rows = rows.slice(0, parsed.limit);
    }

    if (Object.keys(parsed.computedColumns).length > 0) {
      rows = rows.map((r) => {
        const row = { ...r };
        for (const [aliasName, computed] of Object.entries(parsed.computedColumns)) {
          if (computed.expr === "IS_NOT_NULL") {
            row[aliasName] = row[computed.col] !== undefined && row[computed.col] !== null;
          }
        }
        return row;
      });
    }

    if (parsed.columns.length > 0 && !parsed.columns.includes("*")) {
      rows = rows.map((r) => {
        const projected: Record<string, unknown> = {};
        for (const col of parsed.columns) {
          if (col in r) {
            projected[col] = r[col];
          }
        }
        for (const aliasName of Object.keys(parsed.computedColumns)) {
          projected[aliasName] = r[aliasName];
        }
        return projected;
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

  if (text.startsWith("DELETE")) {
    const tableMatch = text.match(/DELETE FROM (\w+)/i);
    if (!tableMatch) {
      return { rows: [], duration: Date.now() - start };
    }
    const tableName = tableMatch[1];
    const whereMatch = text.match(/WHERE\s+(.+?)(?=\s+RETURNING|$)/i);
    const where: Record<string, unknown> = {};
    let paramIdx = 0;
    if (whereMatch) {
      const parts = whereMatch[1].split(/\s+AND\s+/i).map((p) => p.trim());
      parts.forEach((part) => {
        const colMatch = part.match(/^(\w+)\s*=\s*\$/);
        if (colMatch) {
          where[colMatch[1]] = params[paramIdx++];
        }
      });
    }
    const tableData = getTable(tableName);
    const deletedRows: Record<string, unknown>[] = [];
    tableData.rows = tableData.rows.filter((r) => {
      let match = true;
      for (const [key, value] of Object.entries(where)) {
        if (r[key] !== value) {
          match = false;
          break;
        }
      }
      if (match) {
        deletedRows.push(r);
      }
      return !match;
    });
    if (text.includes("RETURNING")) {
      return { rows: deletedRows, duration: Date.now() - start };
    }
    return { rows: [], duration: Date.now() - start };
  }

  console.warn("[MemoryDB] Unhandled SQL:", text.slice(0, 80));
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
  memoryDb.migrations = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  globalObj[initializedKey] = true;
  console.log("[MemoryDB] Initialized with mock migrations");
}

export const isMemoryMode = process.env.USE_MEMORY_DB === "true" || (!process.env.DATABASE_URL && process.env.STORAGE_DRIVER !== "sqlite");
