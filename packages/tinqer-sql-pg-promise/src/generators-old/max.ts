/**
 * MAX aggregate generator
 */

import type { MaxOperation } from "@webpods/tinqer";
import type { SqlContext } from "../types.js";

/**
 * Generate MAX aggregate
 */
export function generateMax(operation: MaxOperation, _context: SqlContext): string {
  if (operation.selector) {
    return `MAX("${operation.selector}")`;
  }
  return "MAX(*)";
}
