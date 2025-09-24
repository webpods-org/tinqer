/**
 * Converter for GROUP BY operations
 */

import type { ConversionContext, ConversionResult } from "../converter.js";
import type { RowExpression } from "../../expressions/expression.js";
import { visitNode as visitRowNode } from "../visitors/row-visitor.js";

export function convertGroupBy(
  bodyNode: any,
  context: ConversionContext
): ConversionResult<RowExpression> {
  // GROUP BY key selector always operates on rows (before grouping)
  const [expression, registry] = visitRowNode(bodyNode, {
    registry: context.registry,
    lambdaParams: context.lambdaParams,
    tableRef: context.tableRef,
    allowOnlyPureExpressions: false,
  });

  return { expression, registry };
}