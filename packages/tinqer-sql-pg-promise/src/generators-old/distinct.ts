/**
 * DISTINCT clause generator
 */

import type { DistinctOperation } from "@webpods/tinqer";
import type { SqlContext } from "../types.js";

/**
 * Generate DISTINCT keyword
 * Note: DISTINCT is added to SELECT clause, not as a separate clause
 */
export function generateDistinct(_operation: DistinctOperation, _context: SqlContext): string {
  // This just returns the DISTINCT keyword to be added after SELECT
  return "DISTINCT";
}
