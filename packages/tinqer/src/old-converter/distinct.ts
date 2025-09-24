/**
 * DISTINCT operation converter
 */

import type { DistinctOperation, QueryOperation } from "../query-tree/operations.js";
import type { CallExpression as ASTCallExpression } from "../parser/ast-types.js";
import type { ConversionContext } from "./converter-utils.js";

export function convertDistinctOperation(
  _ast: ASTCallExpression,
  source: QueryOperation,
  _context: ConversionContext,
): DistinctOperation | null {
  return {
    type: "queryOperation",
    operationType: "distinct",
    source,
  };
}
