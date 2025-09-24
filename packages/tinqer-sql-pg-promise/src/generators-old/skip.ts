/**
 * SKIP (OFFSET) clause generator
 */

import type { SkipOperation } from "@webpods/tinqer";
import type { SqlContext } from "../types.js";
import { generateValueExpression } from "../expression-generator.js";

/**
 * Generate OFFSET clause
 */
export function generateSkip(operation: SkipOperation, context: SqlContext): string {
  if (typeof operation.count === "number") {
    return `OFFSET ${operation.count}`;
  } else {
    // Handle as expression (ParamRef, ArithmeticExpression, etc.)
    const expr = generateValueExpression(operation.count as any, context);
    return `OFFSET ${expr}`;
  }
}
