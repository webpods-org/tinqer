/**
 * TAKE (LIMIT) clause generator
 */

import type { TakeOperation } from "@webpods/tinqer";
import type { SqlContext } from "../types.js";
import { generateValueExpression } from "../expression-generator.js";

/**
 * Generate LIMIT clause
 */
export function generateTake(operation: TakeOperation, context: SqlContext): string {
  if (typeof operation.count === "number") {
    return `LIMIT ${operation.count}`;
  } else {
    // Handle as expression (ParamRef, ArithmeticExpression, etc.)
    const expr = generateValueExpression(operation.count as any, context);
    return `LIMIT ${expr}`;
  }
}
