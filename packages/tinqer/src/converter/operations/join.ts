/**
 * Converter for JOIN operations
 */

import type { ConversionContext, ConversionResult } from "../converter.js";
import type { RowExpression } from "../../expressions/expression.js";
import { visitNode as visitRowNode } from "../visitors/row-visitor.js";

export function convertJoin(
  bodyNode: any,
  context: ConversionContext,
): ConversionResult<RowExpression> {
  // JOIN key selectors always operate on rows
  const [expression, registry] = visitRowNode(bodyNode, {
    registry: context.registry,
    lambdaParams: context.lambdaParams,
    tableRef: context.tableRef,
    allowOnlyPureExpressions: false,
  });

  return { expression, registry };
}
