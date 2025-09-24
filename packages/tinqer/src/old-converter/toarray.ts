/**
 * TO ARRAY operation converter
 */

import type { ToArrayOperation, QueryOperation } from "../query-tree/operations.js";

export function convertToArrayOperation(source: QueryOperation): ToArrayOperation {
  return {
    type: "queryOperation",
    operationType: "toArray",
    source,
  };
}
