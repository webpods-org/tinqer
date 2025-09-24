/**
 * THEN BY clause generator
 */

import type { ThenByOperation } from "@webpods/tinqer";
import type { SqlContext } from "../types.js";
import { generateValueExpression } from "../expression-generator.js";

/**
 * Generate additional ORDER BY clause
 * Note: THEN BY in SQL is just additional ORDER BY columns
 */
export function generateThenBy(operation: ThenByOperation, context: SqlContext): string {
  let orderByExpr: string;

  if (typeof operation.keySelector === "string") {
    // Simple column name
    orderByExpr = `"${operation.keySelector}"`;
  } else {
    // Complex expression
    orderByExpr = generateValueExpression(operation.keySelector, context);
  }

  const direction = operation.descending ? "DESC" : "ASC";
  // Note: This returns just the additional column, not the full ORDER BY clause
  // The orchestrator will combine all ORDER BY columns
  return `, ${orderByExpr} ${direction}`;
}
