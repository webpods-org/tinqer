/**
 * Tinqer - LINQ to SQL for TypeScript
 * Public API exports
 */

// ==================== LINQ API ====================
// User-facing classes and functions

export { Queryable, OrderedQueryable } from "./linq/queryable.js";
export { TerminalQuery } from "./linq/terminal-query.js";
export { from } from "./linq/from.js";
export { Grouping } from "./linq/grouping.js";
export { DatabaseContext, createContext } from "./linq/database-context.js";

// ==================== LINQ Interfaces ====================
// Type contracts

export type { IQueryable, IOrderedQueryable } from "./linq/iqueryable.js";
export type { IGrouping } from "./linq/igrouping.js";

// ==================== Expression Types ====================
// For parsers and SQL generators to use

export type {
  Expression,
  RowExpression,
  GroupExpression,
  ConstantExpression,

  // Row-level expressions
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
  RowBetweenExpression,
  RowIsNullExpression,
  RowLikeExpression,
  RowRegexExpression,
  RowExistsExpression,

  // Group-level expressions
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
  GroupBetweenExpression,
  GroupIsNullExpression,
  GroupLikeExpression,
  GroupRegexExpression,
  GroupExistsExpression,

  // Operators
  BinaryOperator,
  UnaryOperator,
  ParameterOrigin,
} from "./expressions/expression.js";

// Type guards
export {
  isRowExpression,
  isGroupExpression,
  isConstant,
  isRowParameter,
  isGroupParameter,
  isAggregate,
  isGroupKey,
} from "./expressions/expression.js";

// ==================== Query Tree Types ====================
// Operation nodes for the parsed query tree

export type {
  QueryOperation,
  BaseOperation,
  TableOperation,
  WhereOperation,
  SelectOperation,
  GroupByOperation,
  OrderByOperation,
  OrderByDescendingOperation,
  JoinOperation,
  DistinctOperation,
  SkipOperation,
  TakeOperation,
} from "./query-tree/operations.js";

// ==================== Converter API ====================

export {
  convertLambdaToExpression,
  convertQueryOperation,
  createRegistry,
  addParameter,
  getParametersObject,
  type ConversionContext,
  type ConversionResult,
  type ParameterRegistry,
} from "./converter/converter.js";

// ==================== Parser API ====================

export { parseQuery } from "./parser/parse-query.js";
export type { ParseResult } from "./parser/parse-query.js";
export { parseJavaScript } from "./parser/oxc-parser.js";
