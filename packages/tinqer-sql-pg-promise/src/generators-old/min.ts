/**
 * MIN aggregate generator
 */

import type { MinOperation } from "@webpods/tinqer";
import type { SqlContext } from "../types.js";

/**
 * Generate MIN aggregate
 */
export function generateMin(operation: MinOperation, _context: SqlContext): string {
  if (operation.selector) {
    return `MIN("${operation.selector}")`;
  }
  return "MIN(*)";
}
