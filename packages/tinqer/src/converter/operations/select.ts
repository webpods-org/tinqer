/**
 * Converter for SELECT operations
 */

import type { ConversionContext, ConversionResult } from "../converter.js";
import { visitNode as visitRowNode } from "../visitors/row-visitor.js";
import { visitNode as visitGroupNode } from "../visitors/group-visitor.js";

export function convertSelect(
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
      inSelectProjection: true,
      hasTableParam: context.lambdaParams.size > 0,
    });
    return { expression, registry };
  } else {
    // Before GROUP BY, use row visitor
    const [expression, registry] = visitRowNode(bodyNode, {
      registry: context.registry,
      lambdaParams: context.lambdaParams,
      tableRef: context.tableRef,
      inSelectProjection: true,
      hasTableParam: context.lambdaParams.size > 0,
    });
    return { expression, registry };
  }
}