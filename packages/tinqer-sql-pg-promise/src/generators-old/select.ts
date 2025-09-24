/**
 * SELECT clause generator
 */

import type { SelectOperation, ValueExpression } from "@webpods/tinqer";
import type { SqlContext } from "../types.js";
import { generateExpression, generateValueExpression } from "../expression-generator.js";

/**
 * Generate SELECT clause
 */
export function generateSelect(operation: SelectOperation, context: SqlContext): string {
  // Handle null selector (identity function like .select(u => u))
  if (!operation.selector) {
    return "SELECT *";
  }

  // Handle different selector types
  if (operation.selector.type === "object") {
    // Object projection - generate columns with aliases
    const projection = generateExpression(operation.selector, context);
    return `SELECT ${projection}`;
  } else if (operation.selector.type === "column") {
    // Simple column selection
    const column = generateValueExpression(operation.selector as ValueExpression, context);
    return `SELECT ${column}`;
  } else {
    // Other value expressions
    const value = generateExpression(operation.selector, context);
    return `SELECT ${value}`;
  }
}
