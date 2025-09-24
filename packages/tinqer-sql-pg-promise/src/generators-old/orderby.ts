/**
 * ORDER BY clause generator
 */

import type { OrderByOperation } from "@webpods/tinqer";
import type { SqlContext } from "../types.js";
import { generateValueExpression } from "../expression-generator.js";

/**
 * Generate ORDER BY clause
 */
export function generateOrderBy(operation: OrderByOperation, context: SqlContext): string {
  let orderByExpr: string;

  if (typeof operation.keySelector === "string") {
    // Simple column name - check if it maps to a source column
    if (context.symbolTable) {
      const sourceRef = context.symbolTable.entries.get(operation.keySelector);
      if (sourceRef) {
        orderByExpr = `"${sourceRef.tableAlias}"."${sourceRef.columnName}"`;
      } else {
        orderByExpr = `"${operation.keySelector}"`;
      }
    } else {
      orderByExpr = `"${operation.keySelector}"`;
    }
  } else {
    // Complex expression
    orderByExpr = generateValueExpression(operation.keySelector, context);
  }

  const direction = operation.descending ? "DESC" : "ASC";
  return `ORDER BY ${orderByExpr} ${direction}`;
}
