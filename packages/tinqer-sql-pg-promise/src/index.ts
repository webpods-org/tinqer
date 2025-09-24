/**
 * PostgreSQL SQL generator for Tinqer using pg-promise format
 */

import {
  parseQuery,
  type Queryable,
  type OrderedQueryable,
  type TerminalQuery,
} from "@webpods/tinqer";
import { generateSql } from "./sql-generator.js";
import type { SqlResult } from "./types.js";

/**
 * Generate SQL from a query builder function
 * @param queryBuilder Function that builds the query using LINQ operations
 * @param params Parameters to pass to the query builder
 * @returns SQL string and merged params (user params + auto-extracted params)
 */
export function query<TParams, TResult>(
  queryBuilder: (
    params: TParams,
  ) => Queryable<TResult> | OrderedQueryable<TResult> | TerminalQuery<TResult>,
  params: TParams,
): SqlResult<TParams & Record<string, string | number | boolean | null>> {
  // Parse the query to get the operation tree and auto-params
  const parseResult = parseQuery(queryBuilder);

  // Merge user params with auto-extracted params
  // User params take priority over auto-params to avoid collisions
  const mergedParams = { ...parseResult.autoParams, ...params };

  // Process array indexing in parameters
  // Look for parameters like "roles[0]" and resolve them
  const processedParams: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(mergedParams)) {
    const arrayMatch = key.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch && arrayMatch[1] && arrayMatch[2]) {
      const arrayName = arrayMatch[1];
      const index = parseInt(arrayMatch[2], 10);
      if (arrayName in mergedParams) {
        const arrayValue = mergedParams[arrayName];
        if (Array.isArray(arrayValue) && index < arrayValue.length) {
          processedParams[key] = arrayValue[index];
        }
      }
    } else {
      processedParams[key] = value;
    }
  }

  // Generate SQL from the operation tree
  const sql = generateSql(parseResult.operation, mergedParams);

  // Return SQL with processed params (pg-promise will handle parameter substitution)
  // Include both processed and original params
  const finalParams = { ...mergedParams, ...processedParams } as TParams &
    Record<string, string | number | boolean | null>;
  return { sql, params: finalParams };
}

/**
 * Simpler API for generating SQL with auto-parameterization
 * @param queryable A Queryable or TerminalQuery object
 * @returns Object with text (SQL string) and parameters
 */
export function toSql<T>(queryable: Queryable<T> | OrderedQueryable<T> | TerminalQuery<T>): {
  text: string;
  parameters: Record<string, unknown>;
} {
  // Create a dummy function that returns the queryable
  const queryBuilder = () => queryable;

  // Parse and generate SQL
  const parseResult = parseQuery(queryBuilder);

  // Generate SQL with auto-parameters
  const sql = generateSql(parseResult.operation, parseResult.autoParams);

  return {
    text: sql,
    parameters: parseResult.autoParams,
  };
}

/**
 * Database interface for pg-promise compatibility
 */
interface PgDatabase {
  any(sql: string, params?: any): Promise<any[]>;
  one(sql: string, params?: any): Promise<any>;
}

/**
 * Execute a query and return typed results
 * @param db pg-promise database instance
 * @param queryBuilder Function that builds the query using LINQ operations
 * @param params Parameters to pass to the query builder
 * @returns Promise with query results, properly typed based on the query
 */
export async function execute<
  TParams,
  TQuery extends Queryable<any> | OrderedQueryable<any> | TerminalQuery<any>,
>(
  db: PgDatabase,
  queryBuilder: (params: TParams) => TQuery,
  params: TParams,
): Promise<
  TQuery extends Queryable<infer T>
    ? T[]
    : TQuery extends OrderedQueryable<infer T>
      ? T[]
      : TQuery extends TerminalQuery<infer T>
        ? T
        : never
> {
  const { sql, params: sqlParams } = query(queryBuilder, params);

  // Debug SQL output if environment variable is set
  if (process.env.DEBUG_SQL) {
    console.log("=== DEBUG SQL ===");
    console.log("SQL:", sql);
    console.log("Params:", sqlParams);
    console.log("=================");
  }

  // Check if this is a terminal operation that returns a single value
  const parseResult = parseQuery(queryBuilder);

  const operationType = parseResult.operation.operationType;

  // Handle different terminal operations
  switch (operationType) {
    case "first":
    case "firstOrDefault":
    case "single":
    case "singleOrDefault":
    case "last":
    case "lastOrDefault":
      // These return a single item
      const rows = await db.any(sql, sqlParams);
      if (rows.length === 0) {
        if (operationType.includes("OrDefault")) {
          return null as any; // Return null for OrDefault operations
        }
        throw new Error(`No elements found for ${operationType} operation`);
      }
      if (operationType.startsWith("single") && rows.length > 1) {
        throw new Error(`Multiple elements found for ${operationType} operation`);
      }
      return rows[0] as any; // Return single item

    case "count":
    case "longCount":
      // These return a number - SQL is: SELECT COUNT(*) FROM ...
      const countResult = (await db.one(sql, sqlParams)) as { count: string };
      return parseInt(countResult.count, 10) as any;

    case "sum":
    case "average":
    case "min":
    case "max":
      // These return a single aggregate value - SQL is: SELECT SUM/AVG/MIN/MAX(column) FROM ...
      // The result is in the first column of the row
      const aggResult = await db.one(sql, sqlParams);
      // pg-promise returns the aggregate with the function name as key
      const keys = Object.keys(aggResult);
      if (keys.length > 0 && keys[0]) {
        return aggResult[keys[0]] as any;
      }
      return null as any;

    case "any":
      // Returns boolean - SQL is: SELECT CASE WHEN EXISTS(...) THEN 1 ELSE 0 END
      const anyResult = await db.one(sql, sqlParams);
      const anyKeys = Object.keys(anyResult);
      if (anyKeys.length > 0 && anyKeys[0]) {
        return (anyResult[anyKeys[0]] === 1) as any;
      }
      return false as any;

    case "all":
      // Returns boolean - SQL is: SELECT CASE WHEN NOT EXISTS(...) THEN 1 ELSE 0 END
      const allResult = await db.one(sql, sqlParams);
      const allKeys = Object.keys(allResult);
      if (allKeys.length > 0 && allKeys[0]) {
        return (allResult[allKeys[0]] === 1) as any;
      }
      return false as any;

    case "toArray":
    case "toList":
    default:
      // Regular query that returns an array
      return (await db.any(sql, sqlParams)) as any;
  }
}

/**
 * Execute a query with no parameters
 * @param db pg-promise database instance
 * @param queryBuilder Function that builds the query using LINQ operations
 * @returns Promise with query results, properly typed based on the query
 */
export async function executeSimple<
  TQuery extends Queryable<any> | OrderedQueryable<any> | TerminalQuery<any>,
>(
  db: PgDatabase,
  queryBuilder: () => TQuery,
): Promise<
  TQuery extends Queryable<infer T>
    ? T[]
    : TQuery extends OrderedQueryable<infer T>
      ? T[]
      : TQuery extends TerminalQuery<infer T>
        ? T
        : never
> {
  return execute(db, queryBuilder, {});
}

// Export types
export type { SqlResult } from "./types.js";
