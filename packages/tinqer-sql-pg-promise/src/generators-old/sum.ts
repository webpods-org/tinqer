/**
 * SUM aggregate generator
 */

import type { SumOperation } from "@webpods/tinqer";
import type { SqlContext } from "../types.js";

/**
 * Generate SUM aggregate
 */
export function generateSum(operation: SumOperation, _context: SqlContext): string {
  if (operation.selector) {
    return `SUM("${operation.selector}")`;
  }
  return "SUM(*)";
}
