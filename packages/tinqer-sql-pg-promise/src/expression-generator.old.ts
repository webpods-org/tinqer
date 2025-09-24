/**
 * Converts expression trees to SQL fragments
 */

import type {
  Expression,
  BooleanExpression,
  ValueExpression,
  ComparisonExpression,
  LogicalExpression,
  InExpression,
  ColumnExpression,
  ConstantExpression,
  ParameterExpression,
  ArithmeticExpression,
  NotExpression,
  StringMethodExpression,
  BooleanMethodExpression,
  ObjectExpression,
  ArrayExpression,
  ConcatExpression,
  AggregateExpression,
  ConditionalExpression,
  CoalesceExpression,
} from "@webpods/tinqer";
import type { SqlContext } from "./types.js";

/**
 * Generate SQL for any expression
 */
export function generateExpression(expr: Expression, context: SqlContext): string {
  if (isBooleanExpression(expr)) {
    return generateBooleanExpression(expr, context);
  }
  if (isValueExpression(expr)) {
    return generateValueExpression(expr, context);
  }
  if (isObjectExpression(expr)) {
    return generateObjectExpression(expr, context);
  }
  if (isConditionalExpression(expr)) {
    return generateConditionalExpression(expr, context);
  }
  if (isArrayExpression(expr)) {
    throw new Error("Array expressions not yet supported");
  }
  throw new Error(`Unknown expression type: ${(expr as any).type}`);
}

/**
 * Generate SQL for boolean expressions
 */
export function generateBooleanExpression(expr: BooleanExpression, context: SqlContext): string {
  switch (expr.type) {
    case "comparison":
      return generateComparisonExpression(expr, context);
    case "logical":
      return generateLogicalExpression(expr, context);
    case "not":
      return generateNotExpression(expr, context);
    case "booleanColumn":
      return `"${expr.name}"`;
    case "booleanConstant":
      return expr.value ? "TRUE" : "FALSE";
    case "booleanMethod":
      return generateBooleanMethodExpression(expr, context);
    case "in":
      return generateInExpression(expr as InExpression, context);
    default:
      throw new Error(`Unsupported boolean expression type: ${(expr as any).type}`);
  }
}

/**
 * Generate SQL for value expressions
 */
export function generateValueExpression(expr: ValueExpression, context: SqlContext): string {
  switch (expr.type) {
    case "column":
      return generateColumnExpression(expr as ColumnExpression, context);
    case "constant":
      return generateConstantExpression(expr as ConstantExpression);
    case "param":
      return generateParameterExpression(expr as ParameterExpression, context);
    case "arithmetic":
      return generateArithmeticExpression(expr as ArithmeticExpression, context);
    case "concat":
      return generateConcatExpression(expr as ConcatExpression, context);
    case "stringMethod":
      return generateStringMethodExpression(expr as StringMethodExpression, context);
    case "aggregate":
      return generateAggregateExpression(expr as AggregateExpression, context);
    case "coalesce":
      return generateCoalesceExpression(expr as CoalesceExpression, context);
    default:
      throw new Error(`Unsupported value expression type: ${(expr as any).type}`);
  }
}

/**
 * Generate SQL for comparison expressions
 */
function generateComparisonExpression(expr: ComparisonExpression, context: SqlContext): string {
  // Handle cases where left or right side might be boolean expressions
  const left = generateExpressionForComparison(expr.left, context);
  const right = generateExpressionForComparison(expr.right, context);

  // Special handling for NULL comparisons
  if (right === "NULL") {
    if (expr.operator === "==") {
      return `${left} IS NULL`;
    } else if (expr.operator === "!=") {
      return `${left} IS NOT NULL`;
    }
  }
  if (left === "NULL") {
    if (expr.operator === "==") {
      return `${right} IS NULL`;
    } else if (expr.operator === "!=") {
      return `${right} IS NOT NULL`;
    }
  }

  const operator = mapComparisonOperator(expr.operator);
  return `${left} ${operator} ${right}`;
}

/**
 * Generate expression for use in comparisons - handles both value and boolean expressions
 */
function generateExpressionForComparison(expr: any, context: SqlContext): string {
  // Check if it's a boolean expression
  if (isBooleanExpression(expr)) {
    return generateBooleanExpression(expr, context);
  }
  // Otherwise treat as value expression
  return generateValueExpression(expr, context);
}

/**
 * Map JavaScript comparison operators to SQL
 */
function mapComparisonOperator(op: string): string {
  switch (op) {
    case "==":
    case "===":
      return "=";
    case "!=":
    case "!==":
      return "!=";
    case ">":
      return ">";
    case ">=":
      return ">=";
    case "<":
      return "<";
    case "<=":
      return "<=";
    default:
      return op;
  }
}

/**
 * Generate SQL for logical expressions
 */
function generateLogicalExpression(expr: LogicalExpression, context: SqlContext): string {
  const left = generateBooleanExpression(expr.left, context);
  const right = generateBooleanExpression(expr.right, context);
  const operator = expr.operator === "and" ? "AND" : "OR";
  return `(${left} ${operator} ${right})`;
}

/**
 * Generate SQL for NOT expressions
 */
function generateNotExpression(expr: NotExpression, context: SqlContext): string {
  // Special handling for NOT (x = ANY(array)) -> x <> ALL(array) for better PostgreSQL performance
  if (expr.expression.type === "in") {
    const inExpr = expr.expression as InExpression;
    if (!Array.isArray(inExpr.list) && inExpr.list.type === "param") {
      const value = generateValueExpression(inExpr.value, context);
      const paramExpr = inExpr.list as ParameterExpression;
      // Use property if it exists (e.g., params.targetIds), otherwise use param
      const paramName = paramExpr.property || paramExpr.param;
      const formattedParam = `\${${paramName}}`;
      // Convert NOT (x = ANY(array)) to x <> ALL(array)
      return `${value} <> ALL(${formattedParam})`;
    }
  }

  const operand = generateBooleanExpression(expr.expression, context);
  // Check if operand is a simple column reference (no operators)
  if (!operand.includes(" ") && !operand.includes("(")) {
    return `NOT ${operand}`;
  }
  return `NOT (${operand})`;
}

/**
 * Generate SQL for column references
 */
function generateColumnExpression(expr: ColumnExpression, context: SqlContext): string {
  // Handle GROUP BY key references
  if (context.groupByKey) {
    // Handle g.key - single column or expression group by
    if (expr.name === "key" && !expr.table) {
      // Return the GROUP BY expression
      if (context.groupByKey.type === "column") {
        // Simple column - check if it maps to a source column
        const columnExpr = context.groupByKey as ColumnExpression;
        if (context.symbolTable) {
          const sourceRef = context.symbolTable.entries.get(columnExpr.name);
          if (sourceRef) {
            return `"${sourceRef.tableAlias}"."${sourceRef.columnName}"`;
          }
        }
        // For non-JOIN queries, use unqualified column name
        return `"${columnExpr.name}"`;
      } else {
        // Complex expression (including objects, method calls, etc.)
        return generateExpression(context.groupByKey, context);
      }
    }

    // Handle g.key.property - composite group by with object key
    if (expr.table === "key" && context.groupByKey.type === "object") {
      // Look up the property in the composite key
      const objExpr = context.groupByKey as ObjectExpression;
      const keyProperty = objExpr.properties[expr.name];
      if (keyProperty) {
        return generateExpression(keyProperty, context);
      }
    }
  }

  // Check if this is a special marker from JOIN processing
  if (expr.table && expr.table.startsWith("$")) {
    // Handle $param0, $param1 (direct parameter references)
    if (expr.table.startsWith("$param")) {
      const paramIndex = parseInt(expr.table.substring(6), 10);
      const aliases = Array.from(context.tableAliases.values());
      const tableAlias = aliases[paramIndex] || `t${paramIndex}`;
      return `"${tableAlias}"."${expr.name}"`;
    }

    // Handle $joinSource0, $joinSource1 (nested JOIN property access)
    if (expr.table.startsWith("$joinSource")) {
      const sourceIndex = parseInt(expr.table.substring(11), 10);
      const aliases = Array.from(context.tableAliases.values());
      const tableAlias = aliases[sourceIndex] || `t${sourceIndex}`;
      return `"${tableAlias}"."${expr.name}"`;
    }

    // Handle $spread0, $spread1 (spread operator from JOIN result)
    if (expr.table.startsWith("$spread")) {
      const sourceIndex = parseInt(expr.table.substring(7), 10);
      const aliases = Array.from(context.tableAliases.values());
      const tableAlias = aliases[sourceIndex] || `t${sourceIndex}`;
      return `"${tableAlias}"."${expr.name}"`;
    }
  }

  // Check symbol table for JOIN result references
  if (context.symbolTable) {
    // First check for direct property name
    const sourceRef = context.symbolTable.entries.get(expr.name);
    if (sourceRef) {
      // If it's a reference node (marked with "*"), we need special handling
      if (sourceRef.columnName === "*" && expr.table) {
        // This is accessing a property through a reference
        // The symbol table entry tells us which table the reference points to
        return `"${sourceRef.tableAlias}"."${expr.name}"`;
      }
      return `"${sourceRef.tableAlias}"."${sourceRef.columnName}"`;
    }

    // If there's a table prefix, try to build a path
    if (expr.table) {
      const path = `${expr.table}.${expr.name}`;
      const pathRef = context.symbolTable.entries.get(path);
      if (pathRef) {
        return `"${pathRef.tableAlias}"."${pathRef.columnName}"`;
      }

      // Check if the table itself is a reference in the symbol table
      const tableRef = context.symbolTable.entries.get(expr.table);
      if (tableRef && tableRef.columnName === "*") {
        // This is a reference node - resolve to the actual table
        return `"${tableRef.tableAlias}"."${expr.name}"`;
      }
    }
  }

  // Regular column handling
  if (expr.table) {
    const alias = context.tableAliases.get(expr.table) || expr.table;
    return `"${alias}"."${expr.name}"`;
  }
  return `"${expr.name}"`;
}

/**
 * Generate SQL for constants
 */
function generateConstantExpression(expr: ConstantExpression): string {
  if (expr.value === null) {
    return "NULL";
  }
  if (typeof expr.value === "string") {
    // Escape single quotes in strings
    const escaped = expr.value.replace(/'/g, "''");
    return `'${escaped}'`;
  }
  if (typeof expr.value === "boolean") {
    return expr.value ? "TRUE" : "FALSE";
  }
  return String(expr.value);
}

/**
 * Generate SQL for parameter references
 */
function generateParameterExpression(expr: ParameterExpression, context: SqlContext): string {
  // Handle array indexing
  if (expr.index !== undefined) {
    // For array access, we need to extract the value at runtime
    // The parameter should reference the array element directly
    // e.g., params.roles[0] becomes roles[0] in the parameter
    const baseName = expr.property || expr.param;
    const indexedName = `${baseName}[${expr.index}]`;

    // Store the array access for runtime resolution
    // The query executor will need to resolve this
    return context.formatParameter(indexedName);
  }

  // Extract only the last property name for the parameter
  const paramName = expr.property || expr.param;
  return context.formatParameter(paramName);
}

/**
 * Generate SQL for arithmetic expressions
 */
function generateArithmeticExpression(expr: ArithmeticExpression, context: SqlContext): string {
  const left = generateValueExpression(expr.left, context);
  const right = generateValueExpression(expr.right, context);

  // In PostgreSQL, use || for string concatenation
  if (expr.operator === "+") {
    // Check if either operand is definitely a string
    const isStringConcat =
      // String constants
      (expr.left.type === "constant" && typeof (expr.left as any).value === "string") ||
      (expr.right.type === "constant" && typeof (expr.right as any).value === "string") ||
      // String method results (toLowerCase, toUpperCase, substring, etc.)
      expr.left.type === "stringMethod" ||
      expr.right.type === "stringMethod" ||
      // Check if expressions are likely to produce strings
      isLikelyStringExpression(expr.left) ||
      isLikelyStringExpression(expr.right) ||
      // Check for string-related parameter names (heuristic)
      (expr.left.type === "param" && isLikelyStringParam(expr.left as any)) ||
      (expr.right.type === "param" && isLikelyStringParam(expr.right as any));

    if (isStringConcat) {
      return `${left} || ${right}`;
    }
  }

  return `(${left} ${expr.operator} ${right})`;
}

/**
 * Check if a parameter expression is likely a string based on naming patterns
 */
function isLikelyStringParam(expr: { param: string }): boolean {
  const param = expr.param;

  // Check for common string parameter patterns
  const stringPatterns = [
    /_text\d*$/i,
    /_name\d*$/i,
    /_title\d*$/i,
    /_description\d*$/i,
    /_message\d*$/i,
    /_suffix\d*$/i,
    /_prefix\d*$/i,
    /_email\d*$/i,
    /_url\d*$/i,
    /_path\d*$/i,
    /_label\d*$/i,
    /_firstName\d*$/i,
    /_lastName\d*$/i,
  ];

  return stringPatterns.some((pattern) => pattern.test(param));
}

/**
 * Check if an expression is likely to produce a string value
 */
function isLikelyStringExpression(expr: Expression): boolean {
  // Check for COALESCE with string-like columns
  if (expr.type === "coalesce") {
    const coalesceExpr = expr as CoalesceExpression;
    // If any expression in COALESCE is string-like, the result is string-like
    return coalesceExpr.expressions.some((e: Expression) => {
      if (e.type === "column") {
        const col = e as ColumnExpression;
        // Check if column name suggests it's a string
        return /text|name|title|description|message|email|url|path|label/i.test(col.name);
      }
      if (e.type === "constant") {
        return typeof (e as any).value === "string";
      }
      if (e.type === "stringMethod") {
        return true;
      }
      return false;
    });
  }

  return false;
}

/**
 * Generate SQL for string concatenation
 */
function generateConcatExpression(expr: ConcatExpression, context: SqlContext): string {
  const left = generateValueExpression(expr.left, context);
  const right = generateValueExpression(expr.right, context);
  // PostgreSQL uses || for concatenation
  return `${left} || ${right}`;
}

/**
 * Generate SQL for string method expressions
 */
function generateStringMethodExpression(expr: StringMethodExpression, context: SqlContext): string {
  const object = generateValueExpression(expr.object, context);

  switch (expr.method) {
    case "toLowerCase":
      return `LOWER(${object})`;
    case "toUpperCase":
      return `UPPER(${object})`;
    default:
      throw new Error(`Unsupported string method: ${expr.method}`);
  }
}

/**
 * Generate SQL for IN expressions
 */
function generateInExpression(expr: InExpression, context: SqlContext): string {
  const value = generateValueExpression(expr.value, context);

  // Handle list as array expression, array of values, or parameter
  if (!Array.isArray(expr.list) && expr.list.type === "param") {
    // Handle parameter that represents an array
    const paramExpr = expr.list as ParameterExpression;
    // Use property if it exists (e.g., params.targetIds), otherwise use param
    const paramName = paramExpr.property || paramExpr.param;
    const formattedParam = `\${${paramName}}`;

    // Check if we need to handle empty array specially
    // We'll let pg-promise handle the parameter value
    // If it's empty, pg-promise will pass an empty array
    // PostgreSQL will correctly return false for = ANY(ARRAY[]::type[])

    // Use ANY for array parameters in PostgreSQL
    // This converts array.includes(value) to value = ANY(array)
    return `${value} = ANY(${formattedParam})`;
  }

  let listValues: string[];
  if (Array.isArray(expr.list)) {
    listValues = expr.list.map((item) => generateValueExpression(item, context));
  } else if (expr.list.type === "array") {
    const arrayExpr = expr.list as ArrayExpression;
    listValues = arrayExpr.elements.map((item) => generateExpression(item, context));
  } else {
    throw new Error("IN expression requires an array or array parameter");
  }

  if (listValues.length === 0) {
    // Empty IN list always returns false
    return "FALSE";
  }

  return `${value} IN (${listValues.join(", ")})`;
}

/**
 * Generate SQL for boolean method expressions
 */
function generateBooleanMethodExpression(
  expr: BooleanMethodExpression,
  context: SqlContext,
): string {
  const object = generateValueExpression(expr.object, context);

  switch (expr.method) {
    case "startsWith":
      if (expr.arguments && expr.arguments.length > 0) {
        const prefix = generateValueExpression(expr.arguments[0]!, context);
        return `${object} LIKE ${prefix} || '%'`;
      }
      throw new Error("startsWith requires an argument");
    case "endsWith":
      if (expr.arguments && expr.arguments.length > 0) {
        const suffix = generateValueExpression(expr.arguments[0]!, context);
        return `${object} LIKE '%' || ${suffix}`;
      }
      throw new Error("endsWith requires an argument");
    case "includes":
    case "contains":
      if (expr.arguments && expr.arguments.length > 0) {
        const search = generateValueExpression(expr.arguments[0]!, context);
        return `${object} LIKE '%' || ${search} || '%'`;
      }
      throw new Error("includes/contains requires an argument");
    default:
      throw new Error(`Unsupported boolean method: ${expr.method}`);
  }
}

/**
 * Generate SQL for aggregate expressions
 */
function generateAggregateExpression(expr: AggregateExpression, context: SqlContext): string {
  const func = expr.function.toUpperCase();

  // COUNT(*) special case
  if (func === "COUNT" && !expr.expression) {
    return "COUNT(*)";
  }

  // Aggregate with expression (e.g., SUM(amount), COUNT(id))
  if (expr.expression) {
    const innerExpr = generateValueExpression(expr.expression, context);
    return `${func}(${innerExpr})`;
  }

  // Default to COUNT(*) for other aggregates without expression
  return `${func}(*)`;
}

/**
 * Generate SQL for coalesce expressions
 */
function generateCoalesceExpression(expr: CoalesceExpression, context: SqlContext): string {
  const expressions = expr.expressions.map((e) => generateValueExpression(e, context));
  return `COALESCE(${expressions.join(", ")})`;
}

/**
 * Generate SQL for conditional expressions (ternary)
 */
function generateConditionalExpression(expr: ConditionalExpression, context: SqlContext): string {
  const condition = generateBooleanExpression(expr.condition, context);
  const thenExpr = generateExpression(expr.then, context);
  const elseExpr = generateExpression(expr.else, context);
  // Use SQL CASE expression
  return `CASE WHEN ${condition} THEN ${thenExpr} ELSE ${elseExpr} END`;
}

/**
 * Generate SQL for object expressions (used in SELECT)
 */
function generateObjectExpression(expr: ObjectExpression, context: SqlContext): string {
  if (!expr.properties) {
    throw new Error("Object expression must have properties");
  }
  const parts = Object.entries(expr.properties).map(([key, value]) => {
    const sqlValue = generateExpression(value, context);
    return `${sqlValue} AS "${key}"`;
  });
  return parts.join(", ");
}

// Type guards
function isBooleanExpression(expr: Expression): expr is BooleanExpression {
  return [
    "comparison",
    "logical",
    "not",
    "booleanColumn",
    "booleanConstant",
    "booleanMethod",
    "exists",
  ].includes((expr as any).type);
}

function isValueExpression(expr: Expression): expr is ValueExpression {
  return [
    "column",
    "constant",
    "param",
    "arithmetic",
    "concat",
    "stringMethod",
    "case",
    "aggregate",
    "coalesce",
  ].includes((expr as any).type);
}

function isObjectExpression(expr: Expression): expr is ObjectExpression {
  return (expr as any).type === "object";
}

function isArrayExpression(expr: Expression): expr is ArrayExpression {
  return (expr as any).type === "array";
}

function isConditionalExpression(expr: Expression): expr is ConditionalExpression {
  return (expr as any).type === "conditional";
}
