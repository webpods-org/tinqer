/**
 * FIRST operation generator
 */

import type { FirstOperation, FirstOrDefaultOperation } from "@webpods/tinqer";
import type { SqlContext } from "../types.js";

/**
 * Generate SQL for FIRST or FIRSTORDEFAULT operations
 * In PostgreSQL, this is SELECT with LIMIT 1
 * Note: Predicates are handled as WHERE operations before this
 */
export function generateFirst(
  _operation: FirstOperation | FirstOrDefaultOperation,
  _context: SqlContext,
): string {
  // Simple FIRST/FIRSTORDEFAULT - just LIMIT 1
  return "LIMIT 1";
}
