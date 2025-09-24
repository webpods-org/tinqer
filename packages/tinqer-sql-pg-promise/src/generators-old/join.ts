/**
 * JOIN operation generator
 */

import type {
  JoinOperation,
  Expression,
  ObjectExpression,
  ColumnExpression,
  ResultShape,
  ShapeNode,
  ColumnShapeNode,
  ObjectShapeNode,
  ReferenceShapeNode,
} from "@webpods/tinqer";
import type { SqlContext, SymbolTable, SourceReference } from "../types.js";
import { generateSql } from "../sql-generator.js";

/**
 * Build symbol table from ResultShape (new approach with full fidelity)
 */
function buildSymbolTableFromShape(
  resultShape: ResultShape | undefined,
  outerAlias: string,
  innerAlias: string,
  context: SqlContext,
): void {
  if (!resultShape) {
    return;
  }

  // Initialize symbol table if not exists
  if (!context.symbolTable) {
    context.symbolTable = {
      entries: new Map<string, SourceReference>(),
    };
  }

  // Process each property in the result shape
  for (const [propName, shapeNode] of resultShape.properties) {
    processShapeNode(propName, shapeNode, outerAlias, innerAlias, context.symbolTable, "");
  }
}

/**
 * Recursively process shape nodes to build symbol table entries
 */
function processShapeNode(
  propName: string,
  node: ShapeNode,
  outerAlias: string,
  innerAlias: string,
  symbolTable: SymbolTable,
  parentPath: string,
): void {
  const fullPath = parentPath ? `${parentPath}.${propName}` : propName;

  switch (node.type) {
    case "column": {
      const colNode = node as ColumnShapeNode;
      const tableAlias = colNode.sourceTable === 0 ? outerAlias : innerAlias;

      symbolTable.entries.set(fullPath, {
        tableAlias,
        columnName: colNode.columnName,
      });
      break;
    }

    case "object": {
      // Nested object - recurse
      const objNode = node as ObjectShapeNode;
      for (const [nestedProp, nestedNode] of objNode.properties) {
        processShapeNode(nestedProp, nestedNode, outerAlias, innerAlias, symbolTable, fullPath);
      }
      break;
    }

    case "reference": {
      // Reference to entire table - we can't map individual columns yet
      // but we can store that this path references a specific table
      const refNode = node as ReferenceShapeNode;
      const tableAlias = refNode.sourceTable === 0 ? outerAlias : innerAlias;

      // Store a special marker for reference nodes
      symbolTable.entries.set(fullPath, {
        tableAlias,
        columnName: "*", // Special marker for "all columns from this table"
      });
      break;
    }
  }
}

/**
 * Build symbol table from JOIN result selector (legacy approach)
 */
function buildSymbolTable(
  resultSelector: Expression | undefined,
  outerAlias: string,
  innerAlias: string,
  context: SqlContext,
): void {
  if (!resultSelector || resultSelector.type !== "object") {
    return;
  }

  // Initialize symbol table if not exists
  if (!context.symbolTable) {
    context.symbolTable = {
      entries: new Map<string, SourceReference>(),
    };
  }

  const objExpr = resultSelector as ObjectExpression;

  // Process each property in the result selector
  for (const [propName, expr] of Object.entries(objExpr.properties)) {
    processExpression(propName, expr, outerAlias, innerAlias, context.symbolTable, "");
  }
}

/**
 * Recursively process expressions to build symbol table entries
 */
function processExpression(
  propName: string,
  expr: Expression,
  outerAlias: string,
  innerAlias: string,
  symbolTable: SymbolTable,
  parentPath: string,
): void {
  const fullPath = parentPath ? `${parentPath}.${propName}` : propName;

  if (expr.type === "column") {
    const colExpr = expr as ColumnExpression;

    // Check if this references a JOIN parameter ($param0, $param1)
    if (colExpr.table && colExpr.table.startsWith("$param")) {
      const paramIndex = parseInt(colExpr.table.substring(6), 10);
      const tableAlias = paramIndex === 0 ? outerAlias : innerAlias;

      symbolTable.entries.set(fullPath, {
        tableAlias,
        columnName: colExpr.name,
      });
    } else {
      // Regular column without parameter reference
      symbolTable.entries.set(fullPath, {
        tableAlias: colExpr.table || outerAlias,
        columnName: colExpr.name,
      });
    }
  } else if (expr.type === "object") {
    // Nested object - recurse
    const nestedObj = expr as ObjectExpression;
    for (const [nestedProp, nestedExpr] of Object.entries(nestedObj.properties)) {
      processExpression(nestedProp, nestedExpr, outerAlias, innerAlias, symbolTable, fullPath);
    }
  }
  // TODO: Handle other expression types (arithmetic, concat, etc.)
}

/**
 * Generate JOIN clause
 */
export function generateJoin(operation: JoinOperation, context: SqlContext): string {
  // Get table aliases
  const outerAlias = context.tableAliases.values().next().value || "t0";
  const innerAlias = `t${context.aliasCounter++}`;

  // Build symbol table from result shape (preferred) or result selector (fallback)
  if (operation.resultShape) {
    buildSymbolTableFromShape(operation.resultShape, outerAlias, innerAlias, context);
  } else if (operation.resultSelector) {
    buildSymbolTable(operation.resultSelector, outerAlias, innerAlias, context);
  }

  // Store the result selector for SELECT generation
  if (operation.resultSelector) {
    context.currentShape = operation.resultSelector;
  }

  // Check if inner is just a simple FROM operation
  let joinClause: string;
  if (operation.inner.operationType === "from") {
    const fromOp = operation.inner as any;
    const tableName = fromOp.table;
    joinClause = `INNER JOIN "${tableName}" AS "${innerAlias}"`;
  } else {
    // Complex inner query - need subquery
    const innerSql = generateSql(operation.inner, {});
    joinClause = `INNER JOIN (${innerSql}) AS "${innerAlias}"`;
  }

  // Build ON clause
  const onClause = `ON "${outerAlias}"."${operation.outerKey}" = "${innerAlias}"."${operation.innerKey}"`;

  return `${joinClause} ${onClause}`;
}
