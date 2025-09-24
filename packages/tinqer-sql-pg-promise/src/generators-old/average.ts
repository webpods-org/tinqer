/**
 * AVG aggregate generator
 */

import type { AverageOperation } from "@webpods/tinqer";
import type { SqlContext } from "../types.js";

/**
 * Generate AVG aggregate
 */
export function generateAverage(operation: AverageOperation, _context: SqlContext): string {
  if (operation.selector) {
    return `AVG("${operation.selector}")`;
  }
  return "AVG(*)";
}
