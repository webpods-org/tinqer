/**
 * GROUP BY clause generator
 */

import type { GroupByOperation } from "@webpods/tinqer";
import type { SqlContext } from "../types.js";
import { generateExpression } from "../expression-generator.js";

/**
 * Generate GROUP BY clause
 */
export function generateGroupBy(operation: GroupByOperation, context: SqlContext): string {
  const keySelector = operation.keySelector;

  // Handle different expression types
  if (keySelector.type === "object") {
    // Composite key - generate GROUP BY for each property
    // e.g., { name: u.name, dept: u.dept } => GROUP BY name, dept
    const groupByColumns: string[] = [];

    for (const propName in keySelector.properties) {
      const propExpr = keySelector.properties[propName];
      if (propExpr) {
        const sqlExpr = generateExpression(propExpr, context);
        groupByColumns.push(sqlExpr);
      }
    }

    return groupByColumns.length > 0 ? `GROUP BY ${groupByColumns.join(", ")}` : "GROUP BY 1"; // Fallback, shouldn't happen
  } else if (keySelector.type === "column") {
    // Simple column - check symbol table for mapping
    const columnName = keySelector.name;
    if (context.symbolTable) {
      const sourceRef = context.symbolTable.entries.get(columnName);
      if (sourceRef) {
        return `GROUP BY "${sourceRef.tableAlias}"."${sourceRef.columnName}"`;
      }
    }
    // For non-JOIN queries, use unqualified column name
    return `GROUP BY "${columnName}"`;
  } else {
    // Any other expression (method calls, binary ops, etc.)
    // Generate the expression and use it in GROUP BY
    const groupByExpr = generateExpression(keySelector, context);
    return `GROUP BY ${groupByExpr}`;
  }
}
