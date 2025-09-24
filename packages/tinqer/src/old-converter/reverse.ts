/**
 * REVERSE operation converter
 */

import type { ReverseOperation, QueryOperation } from "../query-tree/operations.js";

export function convertReverseOperation(source: QueryOperation): ReverseOperation {
  return {
    type: "queryOperation",
    operationType: "reverse",
    source,
  };
}
