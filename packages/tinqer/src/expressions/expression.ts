import type { QueryOperation } from "../query-tree/operations.js";

// ==================== Parameter Origin ====================

export type ParameterOrigin = { type: "table"; ref: string } | { type: "lambda"; ref: string };

// ==================== Constants (work in both contexts) ====================

export interface ConstantExpression {
  type: "constant";
  value: unknown;
}

// ==================== Row-Level Expressions (before GROUP BY) ====================

export interface RowParameterExpression {
  type: "row-parameter";
  name: string;
  origin: ParameterOrigin;
}

export interface RowMemberExpression {
  type: "row-member";
  object: RowExpression;
  property: string;
  optional?: boolean;
}

export interface RowBinaryExpression {
  type: "row-binary";
  operator: BinaryOperator;
  left: RowExpression;
  right: RowExpression;
}

export interface RowUnaryExpression {
  type: "row-unary";
  operator: UnaryOperator;
  argument: RowExpression;
}

export interface RowConditionalExpression {
  type: "row-conditional";
  test: RowExpression;
  consequent: RowExpression;
  alternate: RowExpression;
}

export interface RowCallExpression {
  type: "row-call";
  function: string;
  arguments: RowExpression[];
}

export interface RowArrayExpression {
  type: "row-array";
  elements: RowExpression[];
}

export interface RowObjectExpression {
  type: "row-object";
  properties: Array<{ key: string; value: RowExpression }>;
}

export interface RowCastExpression {
  type: "row-cast";
  expression: RowExpression;
  targetType: "string" | "number" | "boolean" | "date";
}

export interface RowCoalesceExpression {
  type: "row-coalesce";
  expressions: RowExpression[];
}

export interface RowInExpression {
  type: "row-in";
  value: RowExpression;
  list: RowExpression[] | RowArrayExpression;
}

export interface RowBetweenExpression {
  type: "row-between";
  value: RowExpression;
  lower: RowExpression;
  upper: RowExpression;
}

export interface RowIsNullExpression {
  type: "row-is-null";
  expression: RowExpression;
  negated?: boolean;
}

export interface RowLikeExpression {
  type: "row-like";
  value: RowExpression;
  pattern: RowExpression;
  escape?: string;
}

export interface RowRegexExpression {
  type: "row-regex";
  value: RowExpression;
  pattern: RowExpression;
  flags?: string;
}

export interface RowExistsExpression {
  type: "row-exists";
  subquery: QueryOperation;
  negated?: boolean;
}

export type RowExpression =
  | RowParameterExpression
  | RowMemberExpression
  | RowBinaryExpression
  | RowUnaryExpression
  | RowConditionalExpression
  | RowCallExpression
  | RowArrayExpression
  | RowObjectExpression
  | RowCastExpression
  | RowCoalesceExpression
  | RowInExpression
  | RowBetweenExpression
  | RowIsNullExpression
  | RowLikeExpression
  | RowRegexExpression
  | RowExistsExpression
  | ConstantExpression;

// ==================== Group-Level Expressions (after GROUP BY) ====================

export interface GroupParameterExpression {
  type: "group-parameter";
  name: string;
  origin: ParameterOrigin;
}

export interface GroupKeyExpression {
  type: "group-key";
  keyExpression: RowExpression;
  origin: ParameterOrigin;
}

export interface AggregateExpression {
  type: "aggregate";
  function: "sum" | "count" | "avg" | "min" | "max" | "array_agg" | "string_agg";
  expression: RowExpression | null;
  distinct?: boolean;
  separator?: string;
  origin: ParameterOrigin;
}

export interface GroupMemberExpression {
  type: "group-member";
  object: GroupExpression;
  property: string;
  optional?: boolean;
}

export interface GroupBinaryExpression {
  type: "group-binary";
  operator: BinaryOperator;
  left: GroupExpression;
  right: GroupExpression;
}

export interface GroupUnaryExpression {
  type: "group-unary";
  operator: UnaryOperator;
  argument: GroupExpression;
}

export interface GroupConditionalExpression {
  type: "group-conditional";
  test: GroupExpression;
  consequent: GroupExpression;
  alternate: GroupExpression;
}

export interface GroupCallExpression {
  type: "group-call";
  function: string;
  arguments: GroupExpression[];
}

export interface GroupArrayExpression {
  type: "group-array";
  elements: GroupExpression[];
}

export interface GroupObjectExpression {
  type: "group-object";
  properties: Array<{ key: string; value: GroupExpression }>;
}

export interface GroupCastExpression {
  type: "group-cast";
  expression: GroupExpression;
  targetType: "string" | "number" | "boolean" | "date";
}

export interface GroupCoalesceExpression {
  type: "group-coalesce";
  expressions: GroupExpression[];
}

export interface GroupInExpression {
  type: "group-in";
  value: GroupExpression;
  list: GroupExpression[] | GroupArrayExpression;
}

export interface GroupBetweenExpression {
  type: "group-between";
  value: GroupExpression;
  lower: GroupExpression;
  upper: GroupExpression;
}

export interface GroupIsNullExpression {
  type: "group-is-null";
  expression: GroupExpression;
  negated?: boolean;
}

export interface GroupLikeExpression {
  type: "group-like";
  value: GroupExpression;
  pattern: GroupExpression;
  escape?: string;
}

export interface GroupRegexExpression {
  type: "group-regex";
  value: GroupExpression;
  pattern: GroupExpression;
  flags?: string;
}

export interface GroupExistsExpression {
  type: "group-exists";
  subquery: QueryOperation;
  negated?: boolean;
}

export type GroupExpression =
  | GroupParameterExpression
  | GroupKeyExpression
  | AggregateExpression
  | GroupMemberExpression
  | GroupBinaryExpression
  | GroupUnaryExpression
  | GroupConditionalExpression
  | GroupCallExpression
  | GroupArrayExpression
  | GroupObjectExpression
  | GroupCastExpression
  | GroupCoalesceExpression
  | GroupInExpression
  | GroupBetweenExpression
  | GroupIsNullExpression
  | GroupLikeExpression
  | GroupRegexExpression
  | GroupExistsExpression
  | ConstantExpression;

// ==================== Union Type ====================

export type Expression = RowExpression | GroupExpression;

// ==================== Operators ====================

export type BinaryOperator =
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "&&"
  | "||"
  | "??"
  | "in"
  | "includes";

export type UnaryOperator = "!" | "-" | "+";

// ==================== Type Guards ====================

export function isRowExpression(expr: Expression): expr is RowExpression {
  return expr.type.startsWith("row-") || expr.type === "constant";
}

export function isGroupExpression(expr: Expression): expr is GroupExpression {
  return (
    expr.type.startsWith("group-") ||
    expr.type === "aggregate" ||
    expr.type === "group-key" ||
    expr.type === "constant"
  );
}

export function isConstant(expr: Expression): expr is ConstantExpression {
  return expr.type === "constant";
}

export function isRowParameter(expr: Expression): expr is RowParameterExpression {
  return expr.type === "row-parameter";
}

export function isGroupParameter(expr: Expression): expr is GroupParameterExpression {
  return expr.type === "group-parameter";
}

export function isAggregate(expr: Expression): expr is AggregateExpression {
  return expr.type === "aggregate";
}

export function isGroupKey(expr: Expression): expr is GroupKeyExpression {
  return expr.type === "group-key";
}

/**
 * Type aliases for backward compatibility with tests
 */
export type ComparisonExpression = RowBinaryExpression & { type: "comparison" };
export type ObjectExpression = RowObjectExpression;
export type LogicalExpression = RowBinaryExpression;
export type BooleanMethodExpression = RowCallExpression;
export type ColumnExpression = RowMemberExpression;
