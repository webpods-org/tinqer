/**
 * SINGLE operation generator
 */

import type { SingleOperation, SingleOrDefaultOperation } from "@webpods/tinqer";
import type { SqlContext } from "../types.js";

/**
 * Generate SQL for SINGLE or SINGLEORDEFAULT operations
 * In PostgreSQL, we use LIMIT 2 and check for exactly 1 result in the client
 * Note: Predicates are handled as WHERE operations before this
 */
export function generateSingle(
  _operation: SingleOperation | SingleOrDefaultOperation,
  _context: SqlContext,
): string {
  // SINGLE/SINGLEORDEFAULT - LIMIT 2 to check for multiple results (client validates exactly 1)
  return "LIMIT 2";
}
