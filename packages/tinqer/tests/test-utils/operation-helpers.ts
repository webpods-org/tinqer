/**
 * Type-safe helpers for accessing QueryOperation properties in tests
 */

import type {
  QueryOperation,
  FromOperation,
  WhereOperation,
  SelectOperation,
  OrderByOperation,
  OrderByDescendingOperation,
  ThenByOperation,
  ThenByDescendingOperation,
  TakeOperation,
  SkipOperation,
  GroupByOperation,
  JoinOperation,
  DistinctOperation,
} from "../../src/query-tree/operations.js";
import type { ParseResult } from "../../src/parser/parse-query.js";

/**
 * Extract operation from ParseResult
 */
export function getOperation(result: ParseResult | null): QueryOperation | null {
  return result?.operation || null;
}

/**
 * Type guard and accessor for FromOperation
 */
export function asFromOperation(op: QueryOperation | null): FromOperation {
  if (!op || op.type !== "from") {
    throw new Error(`Expected FromOperation but got ${op?.type || "null"}`);
  }
  return op as FromOperation;
}

/**
 * Type guard and accessor for WhereOperation
 */
export function asWhereOperation(op: QueryOperation | null): WhereOperation {
  if (!op || op.type !== "where") {
    throw new Error(`Expected WhereOperation but got ${op?.type || "null"}`);
  }
  return op as WhereOperation;
}

/**
 * Type guard and accessor for SelectOperation
 */
export function asSelectOperation(op: QueryOperation | null): SelectOperation {
  if (!op || op.type !== "select") {
    throw new Error(`Expected SelectOperation but got ${op?.type || "null"}`);
  }
  return op as SelectOperation;
}

/**
 * Type guard and accessor for OrderByOperation
 */
export function asOrderByOperation(op: QueryOperation | null): OrderByOperation {
  if (!op || op.type !== "orderBy") {
    throw new Error(`Expected OrderByOperation but got ${op?.type || "null"}`);
  }
  return op as OrderByOperation;
}

/**
 * Type guard and accessor for OrderByDescendingOperation
 */
export function asOrderByDescendingOperation(
  op: QueryOperation | null,
): OrderByDescendingOperation {
  if (!op || op.type !== "orderByDescending") {
    throw new Error(`Expected OrderByDescendingOperation but got ${op?.type || "null"}`);
  }
  return op as OrderByDescendingOperation;
}

/**
 * Type guard and accessor for ThenByOperation
 */
export function asThenByOperation(op: QueryOperation | null): ThenByOperation {
  if (!op || op.type !== "thenBy") {
    throw new Error(`Expected ThenByOperation but got ${op?.type || "null"}`);
  }
  return op as ThenByOperation;
}

/**
 * Type guard and accessor for ThenByDescendingOperation
 */
export function asThenByDescendingOperation(op: QueryOperation | null): ThenByDescendingOperation {
  if (!op || op.type !== "thenByDescending") {
    throw new Error(`Expected ThenByDescendingOperation but got ${op?.type || "null"}`);
  }
  return op as ThenByDescendingOperation;
}

/**
 * Type guard and accessor for TakeOperation
 */
export function asTakeOperation(op: QueryOperation | null): TakeOperation {
  if (!op || op.type !== "take") {
    throw new Error(`Expected TakeOperation but got ${op?.type || "null"}`);
  }
  return op as TakeOperation;
}

/**
 * Type guard and accessor for SkipOperation
 */
export function asSkipOperation(op: QueryOperation | null): SkipOperation {
  if (!op || op.type !== "skip") {
    throw new Error(`Expected SkipOperation but got ${op?.type || "null"}`);
  }
  return op as SkipOperation;
}

/**
 * Type guard and accessor for GroupByOperation
 */
export function asGroupByOperation(op: QueryOperation | null): GroupByOperation {
  if (!op || op.type !== "groupBy") {
    throw new Error(`Expected GroupByOperation but got ${op?.type || "null"}`);
  }
  return op as GroupByOperation;
}

/**
 * Type guard and accessor for JoinOperation
 */
export function asJoinOperation(op: QueryOperation | null): JoinOperation {
  if (!op || op.type !== "join") {
    throw new Error(`Expected JoinOperation but got ${op?.type || "null"}`);
  }
  return op as JoinOperation;
}

/**
 * Type guard and accessor for DistinctOperation
 */
export function asDistinctOperation(op: QueryOperation | null): DistinctOperation {
  if (!op || op.type !== "distinct") {
    throw new Error(`Expected DistinctOperation but got ${op?.type || "null"}`);
  }
  return op as DistinctOperation;
}
