/**
 * Converter for WHERE operations
 */

import type { ConversionContext, ConversionResult } from "../converter.js";
import { visitNode as visitRowNode } from "../visitors/row-visitor.js";
import { visitNode as visitGroupNode } from "../visitors/group-visitor.js";

export function convertWhere(
  bodyNode: any,
  context: ConversionContext
): ConversionResult {
  if (context.isGrouped) {
    // After GROUP BY, use group visitor
    const [expression, registry] = visitGroupNode(bodyNode, {
      registry: context.registry,
      lambdaParams: context.lambdaParams,
      tableRef: context.tableRef,
      groupKeys: context.groupKeys || new Map(),
      allowOnlyPureExpressions: false,
    });
    return { expression, registry };
  } else {
    // Before GROUP BY, use row visitor
    const [expression, registry] = visitRowNode(bodyNode, {
      registry: context.registry,
      lambdaParams: context.lambdaParams,
      tableRef: context.tableRef,
      allowOnlyPureExpressions: false,
    });
    return { expression, registry };
  }
}