/**
 * ANY operation generator
 */

import type { AnyOperation } from "@webpods/tinqer";
import type { SqlContext } from "../types.js";
import { generateBooleanExpression } from "../expression-generator.js";

/**
 * Generate SQL for ANY operation
 * Uses EXISTS to check if any records match
 */
export function generateAny(operation: AnyOperation, context: SqlContext): string {
  if (operation.predicate) {
    // ANY with predicate: EXISTS(SELECT 1 WHERE predicate)
    const predicate = generateBooleanExpression(operation.predicate, context);
    return `EXISTS(SELECT 1 WHERE ${predicate})`;
  } else {
    // ANY without predicate: just check if any records exist
    return "EXISTS(SELECT 1)";
  }
}
