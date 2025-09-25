/**
 * Query Operation Types for Tinqer
 *
 * These types represent the query operations that can be performed.
 * They are simpler than before and work with the new expression system.
 */

import type { Expression, RowExpression, GroupExpression } from "../expressions/expression.js";
import type { ParameterRegistry } from "../converter/parameter-registry.js";

/**
 * Reference to an auto-parameterized value
 */
export interface ParamRef {
  type: "param";
  param: string; // Parameter name like "__p1"
}

/**
 * Base query operation
 */
export interface BaseOperation {
  type: string;
  operationType?: string; // For backward compatibility with tests
}

/**
 * FROM operation - source of queries
 * Note: type is "from" for compatibility with old parser
 */
export interface FromOperation extends BaseOperation {
  type: "from";
  operationType: "from";
  table: string;
  schema?: string;
}

/**
 * WHERE operation
 */
export interface WhereOperation extends BaseOperation {
  type: "where";
  operationType: "where";
  source: QueryOperation;
  predicate: string | Expression; // Lambda string or converted expression
  expression?: Expression; // Added by converter
  registry?: ParameterRegistry; // Added by converter
}

/**
 * SELECT operation
 */
export interface SelectOperation extends BaseOperation {
  type: "select";
  operationType: "select";
  source: QueryOperation;
  selector: string; // Lambda string - renamed to match old format
  expression?: Expression; // Added by converter
  registry?: ParameterRegistry; // Added by converter
}

/**
 * GROUP BY operation
 */
export interface GroupByOperation extends BaseOperation {
  type: "groupBy";
  operationType: "groupBy";
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
  operationType: "orderBy";
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
  operationType: "orderByDescending";
  source: QueryOperation;
  keySelector: string; // Lambda string
  expression?: Expression; // Added by converter
  registry?: ParameterRegistry; // Added by converter
}

/**
 * THEN BY operation - secondary sorting
 */
export interface ThenByOperation extends BaseOperation {
  type: "thenBy";
  operationType: "thenBy";
  source: QueryOperation; // Must be OrderBy, OrderByDescending, or another ThenBy
  keySelector: string; // Lambda string
  expression?: Expression; // Added by converter
  registry?: ParameterRegistry; // Added by converter
}

/**
 * THEN BY DESCENDING operation - secondary sorting descending
 */
export interface ThenByDescendingOperation extends BaseOperation {
  type: "thenByDescending";
  operationType: "thenByDescending";
  source: QueryOperation; // Must be OrderBy, OrderByDescending, or another ThenBy
  keySelector: string; // Lambda string
  expression?: Expression; // Added by converter
  registry?: ParameterRegistry; // Added by converter
}

/**
 * JOIN operation
 */
export interface JoinOperation extends BaseOperation {
  type: "join";
  operationType: "join";
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
  operationType: "distinct";
  source: QueryOperation;
}

/**
 * SKIP operation
 */
export interface SkipOperation extends BaseOperation {
  type: "skip";
  operationType: "skip";
  source: QueryOperation;
  count: number | ParamRef; // Can be number or parameterized
  countExpression?: Expression; // Added by converter
  registry?: ParameterRegistry; // Added by converter
}

/**
 * TAKE operation
 */
export interface TakeOperation extends BaseOperation {
  type: "take";
  operationType: "take";
  source: QueryOperation;
  count: number | ParamRef; // Can be number or parameterized
  countExpression?: Expression; // Added by converter
  registry?: ParameterRegistry; // Added by converter
}

/**
 * Union type for all query operations
 */
export type QueryOperation =
  | FromOperation
  | WhereOperation
  | SelectOperation
  | GroupByOperation
  | OrderByOperation
  | OrderByDescendingOperation
  | ThenByOperation
  | ThenByDescendingOperation
  | JoinOperation
  | DistinctOperation
  | SkipOperation
  | TakeOperation;
