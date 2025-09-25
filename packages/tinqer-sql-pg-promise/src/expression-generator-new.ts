/**
 * SQL Expression Generator for new expression types
 */

import type {
  Expression,
  RowExpression,
  GroupExpression,
  ConstantExpression,
  RowParameterExpression,
  RowMemberExpression,
  RowBinaryExpression,
  RowUnaryExpression,
  RowConditionalExpression,
  RowCallExpression,
  RowArrayExpression,
  RowObjectExpression,
  RowCastExpression,
  RowCoalesceExpression,
  RowInExpression,
  GroupParameterExpression,
  GroupKeyExpression,
  AggregateExpression,
  GroupMemberExpression,
  GroupBinaryExpression,
  GroupUnaryExpression,
  GroupConditionalExpression,
  GroupCallExpression,
  GroupArrayExpression,
  GroupObjectExpression,
  GroupCastExpression,
  GroupCoalesceExpression,
  GroupInExpression,
} from "@webpods/tinqer";

import { isRowExpression, isGroupExpression, isConstant } from "@webpods/tinqer";

export interface SqlGeneratorContext {
  paramPrefix: string;
  tableAlias?: string;
  isGrouped: boolean;
}

/**
 * Generate SQL for any expression
 */
export function generateExpression(expr: Expression, context: SqlGeneratorContext): string {
  if (isConstant(expr)) {
    return generateConstant(expr);
  }
  if (isRowExpression(expr)) {
    return generateRowExpression(expr, context);
  }
  if (isGroupExpression(expr)) {
    return generateGroupExpression(expr, context);
  }
  throw new Error(`Unknown expression type: ${(expr as any).type}`);
}

/**
 * Generate SQL for constants
 */
function generateConstant(expr: ConstantExpression): string {
  const { value } = expr;

  if (value === null) {
    return "NULL";
  }
  if (value === undefined) {
    return "NULL";
  }
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }
  if (typeof value === "number") {
    return value.toString();
  }
  if (typeof value === "string") {
    // String literals need to be escaped
    return `'${value.replace(/'/g, "''")}'`;
  }
  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }

  throw new Error(`Unsupported constant value type: ${typeof value}`);
}

/**
 * Generate SQL for row-level expressions
 */
function generateRowExpression(expr: RowExpression, context: SqlGeneratorContext): string {
  switch (expr.type) {
    case "constant":
      return generateConstant(expr);

    case "row-parameter": {
      const param = expr as RowParameterExpression;
      const alias = context.tableAlias || param.origin.ref;
      return `"${alias}".*`;
    }

    case "row-member": {
      const member = expr as RowMemberExpression;
      if (member.object.type === "row-parameter") {
        const param = member.object as RowParameterExpression;
        const alias = context.tableAlias || param.origin.ref;
        return `"${alias}"."${member.property}"`;
      }
      // Nested member access
      const objectSql = generateRowExpression(member.object, context);
      return `(${objectSql})."${member.property}"`;
    }

    case "row-binary": {
      const binary = expr as RowBinaryExpression;
      const left = generateRowExpression(binary.left, context);
      const right = generateRowExpression(binary.right, context);
      return generateBinaryOp(left, binary.operator, right);
    }

    case "row-unary": {
      const unary = expr as RowUnaryExpression;
      const arg = generateRowExpression(unary.argument, context);
      return generateUnaryOp(unary.operator, arg);
    }

    case "row-conditional": {
      const cond = expr as RowConditionalExpression;
      const test = generateRowExpression(cond.test, context);
      const consequent = generateRowExpression(cond.consequent, context);
      const alternate = generateRowExpression(cond.alternate, context);
      return `CASE WHEN ${test} THEN ${consequent} ELSE ${alternate} END`;
    }

    case "row-call": {
      const call = expr as RowCallExpression;
      return generateFunctionCall(
        call.function,
        call.arguments.map((arg) => generateRowExpression(arg, context)),
      );
    }

    case "row-array": {
      const array = expr as RowArrayExpression;
      const elements = array.elements.map((el) => generateRowExpression(el, context));
      return `ARRAY[${elements.join(", ")}]`;
    }

    case "row-object": {
      const obj = expr as RowObjectExpression;
      // Generate as a row constructor or JSON
      const props = obj.properties.map(
        ({ key, value }) => `'${key}', ${generateRowExpression(value, context)}`,
      );
      return `json_build_object(${props.join(", ")})`;
    }

    case "row-cast": {
      const cast = expr as RowCastExpression;
      const sqlExpr = generateRowExpression(cast.expression, context);
      const sqlType = getSqlType(cast.targetType);
      return `CAST(${sqlExpr} AS ${sqlType})`;
    }

    case "row-coalesce": {
      const coalesce = expr as RowCoalesceExpression;
      const args = coalesce.expressions.map((e) => generateRowExpression(e, context));
      return `COALESCE(${args.join(", ")})`;
    }

    case "row-in": {
      const inExpr = expr as RowInExpression;
      const value = generateRowExpression(inExpr.value, context);
      if (Array.isArray(inExpr.list)) {
        const list = inExpr.list.map((item) => generateRowExpression(item, context));
        return `${value} IN (${list.join(", ")})`;
      } else {
        const listSql = generateRowExpression(inExpr.list, context);
        return `${value} = ANY(${listSql})`;
      }
    }

    default:
      throw new Error(`Unsupported row expression type: ${(expr as any).type}`);
  }
}

/**
 * Generate SQL for group-level expressions
 */
function generateGroupExpression(expr: GroupExpression, context: SqlGeneratorContext): string {
  switch (expr.type) {
    case "constant":
      return generateConstant(expr);

    case "group-parameter": {
      // In GROUP BY context, parameter represents the group
      const param = expr as GroupParameterExpression;
      const alias = context.tableAlias || param.origin.ref;
      return `"${alias}".*`;
    }

    case "group-key": {
      // This is a grouped column - it's available directly
      const key = expr as GroupKeyExpression;
      return generateRowExpression(key.keyExpression, { ...context, isGrouped: false });
    }

    case "aggregate": {
      const agg = expr as AggregateExpression;
      return generateAggregate(agg, context);
    }

    case "group-member": {
      const member = expr as GroupMemberExpression;
      if (member.object.type === "group-key") {
        // Accessing property of a group key
        const key = member.object as GroupKeyExpression;
        const keySql = generateRowExpression(key.keyExpression, { ...context, isGrouped: false });
        return `(${keySql})."${member.property}"`;
      }
      // Other member access in group context
      const objectSql = generateGroupExpression(member.object, context);
      return `(${objectSql})."${member.property}"`;
    }

    case "group-binary": {
      const binary = expr as GroupBinaryExpression;
      const left = generateGroupExpression(binary.left, context);
      const right = generateGroupExpression(binary.right, context);
      return generateBinaryOp(left, binary.operator, right);
    }

    case "group-unary": {
      const unary = expr as GroupUnaryExpression;
      const arg = generateGroupExpression(unary.argument, context);
      return generateUnaryOp(unary.operator, arg);
    }

    case "group-conditional": {
      const cond = expr as GroupConditionalExpression;
      const test = generateGroupExpression(cond.test, context);
      const consequent = generateGroupExpression(cond.consequent, context);
      const alternate = generateGroupExpression(cond.alternate, context);
      return `CASE WHEN ${test} THEN ${consequent} ELSE ${alternate} END`;
    }

    case "group-call": {
      const call = expr as GroupCallExpression;
      return generateFunctionCall(
        call.function,
        call.arguments.map((arg) => generateGroupExpression(arg, context)),
      );
    }

    case "group-array": {
      const array = expr as GroupArrayExpression;
      const elements = array.elements.map((el) => generateGroupExpression(el, context));
      return `ARRAY[${elements.join(", ")}]`;
    }

    case "group-object": {
      const obj = expr as GroupObjectExpression;
      const props = obj.properties.map(
        ({ key, value }) => `'${key}', ${generateGroupExpression(value, context)}`,
      );
      return `json_build_object(${props.join(", ")})`;
    }

    case "group-cast": {
      const cast = expr as GroupCastExpression;
      const sqlExpr = generateGroupExpression(cast.expression, context);
      const sqlType = getSqlType(cast.targetType);
      return `CAST(${sqlExpr} AS ${sqlType})`;
    }

    case "group-coalesce": {
      const coalesce = expr as GroupCoalesceExpression;
      const args = coalesce.expressions.map((e) => generateGroupExpression(e, context));
      return `COALESCE(${args.join(", ")})`;
    }

    case "group-in": {
      const inExpr = expr as GroupInExpression;
      const value = generateGroupExpression(inExpr.value, context);
      if (Array.isArray(inExpr.list)) {
        const list = inExpr.list.map((item) => generateGroupExpression(item, context));
        return `${value} IN (${list.join(", ")})`;
      } else {
        const listSql = generateGroupExpression(inExpr.list, context);
        return `${value} = ANY(${listSql})`;
      }
    }

    default:
      throw new Error(`Unsupported group expression type: ${(expr as any).type}`);
  }
}

/**
 * Generate SQL for aggregate functions
 */
function generateAggregate(agg: AggregateExpression, context: SqlGeneratorContext): string {
  const fnName = agg.function.toUpperCase();

  if (!agg.expression) {
    // COUNT(*)
    return `${fnName}(*)`;
  }

  // Convert expression in row context (operates on rows within group)
  const exprSql = generateRowExpression(agg.expression, { ...context, isGrouped: false });

  if (agg.distinct) {
    return `${fnName}(DISTINCT ${exprSql})`;
  }

  if (agg.function === "string_agg" && agg.separator) {
    return `STRING_AGG(${exprSql}, '${agg.separator}')`;
  }

  return `${fnName}(${exprSql})`;
}

/**
 * Generate binary operator SQL
 */
function generateBinaryOp(left: string, op: string, right: string): string {
  const sqlOp = mapOperator(op);
  return `(${left} ${sqlOp} ${right})`;
}

/**
 * Generate unary operator SQL
 */
function generateUnaryOp(op: string, arg: string): string {
  switch (op) {
    case "!":
      return `NOT ${arg}`;
    case "-":
      return `-${arg}`;
    case "+":
      return `+${arg}`;
    default:
      throw new Error(`Unsupported unary operator: ${op}`);
  }
}

/**
 * Generate function call SQL
 */
function generateFunctionCall(name: string, args: string[]): string {
  // Map JavaScript methods to SQL functions
  switch (name.toLowerCase()) {
    case "includes":
    case "contains":
      if (args.length !== 2) {
        throw new Error(`${name} requires exactly 2 arguments`);
      }
      return `${args[0]} LIKE '%' || ${args[1]} || '%'`;

    case "startswith":
      if (args.length !== 2) {
        throw new Error("startsWith requires exactly 2 arguments");
      }
      return `${args[0]} LIKE ${args[1]} || '%'`;

    case "endswith":
      if (args.length !== 2) {
        throw new Error("endsWith requires exactly 2 arguments");
      }
      return `${args[0]} LIKE '%' || ${args[1]}`;

    case "tolowercase":
      return `LOWER(${args[0]})`;

    case "touppercase":
      return `UPPER(${args[0]})`;

    default:
      // Generic function call
      return `${name.toUpperCase()}(${args.join(", ")})`;
  }
}

/**
 * Map operators to SQL
 */
function mapOperator(op: string): string {
  switch (op) {
    case "==":
      return "=";
    case "!=":
      return "<>";
    case "&&":
      return "AND";
    case "||":
      return "OR";
    case "??":
      return "IS DISTINCT FROM"; // For nullish coalescing context
    default:
      return op;
  }
}

/**
 * Get SQL type for cast operations
 */
function getSqlType(type: string): string {
  switch (type) {
    case "string":
      return "TEXT";
    case "number":
      return "NUMERIC";
    case "boolean":
      return "BOOLEAN";
    case "date":
      return "TIMESTAMP";
    default:
      throw new Error(`Unsupported cast type: ${type}`);
  }
}
