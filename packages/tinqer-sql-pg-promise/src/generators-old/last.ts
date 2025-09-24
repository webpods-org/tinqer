/**
 * LAST operation generator
 */

import type { LastOperation, LastOrDefaultOperation } from "@webpods/tinqer";
import type { SqlContext } from "../types.js";

/**
 * Generate SQL for LAST or LASTORDEFAULT operations
 * In PostgreSQL, this requires reversing any existing ORDER BY and adding LIMIT 1
 * Note: If no ORDER BY exists, we should error since LAST is undefined without order
 * Note: Predicates are handled as WHERE operations before this
 */
export function generateLast(
  _operation: LastOperation | LastOrDefaultOperation,
  _context: SqlContext,
): string {
  // LAST/LASTORDEFAULT requires an ORDER BY to be meaningful
  // The SQL generator should handle reversing existing ORDER BY or adding a default one
  // For now, just return LIMIT 1 and let the orchestrator handle the ordering
  return "LIMIT 1";
}
