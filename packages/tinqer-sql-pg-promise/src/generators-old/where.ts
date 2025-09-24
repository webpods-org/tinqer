/**
 * WHERE clause generator
 */

import type { WhereOperation } from "@webpods/tinqer";
import type { SqlContext } from "../types.js";
import { generateBooleanExpression } from "../expression-generator.js";

/**
 * Generate WHERE clause
 */
export function generateWhere(operation: WhereOperation, context: SqlContext): string {
  const predicate = generateBooleanExpression(operation.predicate, context);
  return `WHERE ${predicate}`;
}
