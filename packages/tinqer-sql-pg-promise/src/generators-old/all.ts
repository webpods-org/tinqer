/**
 * ALL operation generator
 */

import type { AllOperation } from "@webpods/tinqer";
import type { SqlContext } from "../types.js";
import { generateBooleanExpression } from "../expression-generator.js";

/**
 * Generate SQL for ALL operation
 * Uses NOT EXISTS with negated predicate to check all match
 */
export function generateAll(operation: AllOperation, context: SqlContext): string {
  // ALL means no records violate the condition
  // So we check NOT EXISTS(SELECT 1 WHERE NOT predicate)
  const predicate = generateBooleanExpression(operation.predicate, context);
  return `NOT EXISTS(SELECT 1 WHERE NOT (${predicate}))`;
}
