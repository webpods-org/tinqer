/**
 * Query Operation Types for Tinqer
 *
 * These types represent the query operations that can be performed.
 * They are simpler than before and work with the new expression system.
 */

import type { Expression, RowExpression, GroupExpression } from "../expressions/expression.js";
import type { ParameterRegistry } from "../converter/parameter-registry.js";

/**
 * Base query operation
 */
export interface BaseOperation {
  type: string;
}

/**
 * TABLE operation - source of queries
 */
export interface TableOperation extends BaseOperation {
  type: "table";
  table: string;
  schema?: string;
}

/**
 * WHERE operation
 */
export interface WhereOperation extends BaseOperation {
  type: "where";
  source: QueryOperation;
  predicate: string; // Lambda string
  expression?: Expression; // Added by converter
  registry?: ParameterRegistry; // Added by converter
}

/**
 * SELECT operation
 */
export interface SelectOperation extends BaseOperation {
  type: "select";
  source: QueryOperation;
  projection: string; // Lambda string
  expression?: Expression; // Added by converter
  registry?: ParameterRegistry; // Added by converter
}

/**
 * GROUP BY operation
 */
export interface GroupByOperation extends BaseOperation {
  type: "groupBy";
  source: QueryOperation;
  keySelector: string; // Lambda string for key selection
  elementSelector?: string; // Optional lambda for element transformation
  keyExpression?: RowExpression; // Added by converter
  elementExpression?: GroupExpression; // Added by converter
  registry?: ParameterRegistry; // Added by converter
}

/**
 * ORDER BY operation
 */
export interface OrderByOperation extends BaseOperation {
  type: "orderBy";
  source: QueryOperation;
  keySelector: string; // Lambda string
  expression?: Expression; // Added by converter
  registry?: ParameterRegistry; // Added by converter
}

/**
 * ORDER BY DESCENDING operation
 */
export interface OrderByDescendingOperation extends BaseOperation {
  type: "orderByDescending";
  source: QueryOperation;
  keySelector: string; // Lambda string
  expression?: Expression; // Added by converter
  registry?: ParameterRegistry; // Added by converter
}

/**
 * JOIN operation
 */
export interface JoinOperation extends BaseOperation {
  type: "join";
  outer: QueryOperation;
  inner: QueryOperation;
  outerKeySelector: string; // Lambda string
  innerKeySelector: string; // Lambda string
  resultSelector?: string; // Optional lambda for result projection
  outerKeyExpression?: RowExpression; // Added by converter
  innerKeyExpression?: RowExpression; // Added by converter
  resultExpression?: RowExpression; // Added by converter
  registry?: ParameterRegistry; // Added by converter
}

/**
 * DISTINCT operation
 */
export interface DistinctOperation extends BaseOperation {
  type: "distinct";
  source: QueryOperation;
}

/**
 * SKIP operation
 */
export interface SkipOperation extends BaseOperation {
  type: "skip";
  source: QueryOperation;
  count: number;
  countExpression?: Expression; // Added by converter
  registry?: ParameterRegistry; // Added by converter
}

/**
 * TAKE operation
 */
export interface TakeOperation extends BaseOperation {
  type: "take";
  source: QueryOperation;
  count: number;
  countExpression?: Expression; // Added by converter
  registry?: ParameterRegistry; // Added by converter
}

/**
 * Union type for all query operations
 */
export type QueryOperation =
  | TableOperation
  | WhereOperation
  | SelectOperation
  | GroupByOperation
  | OrderByOperation
  | OrderByDescendingOperation
  | JoinOperation
  | DistinctOperation
  | SkipOperation
  | TakeOperation;