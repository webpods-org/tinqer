/**
 * ToArray operation generator
 */

import type { ToArrayOperation } from "@webpods/tinqer";
import type { SqlContext } from "../types.js";

/**
 * Generate SQL for ToArray operation
 * ToArray is essentially a no-op in SQL - it just executes the query
 */
export function generateToArray(_operation: ToArrayOperation, _context: SqlContext): string {
  // ToArray doesn't add any SQL, it just executes the query
  return "";
}
