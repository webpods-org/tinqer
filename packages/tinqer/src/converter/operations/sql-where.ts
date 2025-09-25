/**
 * Converter for WHERE operations using SQL-friendly types
 */

import type { ASTNode } from "../../parser/ast-types.js";
import type { SqlExpression } from "../../expressions/sql-expression.js";
import type { ParameterRegistry } from "../parameter-registry.js";
import {
  visitNode as visitRowNode,
  type SqlRowVisitorContext,
} from "../visitors/sql-row-visitor.js";
import {
  visitNode as visitGroupNode,
  type SqlGroupVisitorContext,
} from "../visitors/sql-group-visitor.js";

export interface ConversionResult {
  expression: SqlExpression;
  registry: ParameterRegistry;
}

export function convertWhere(
  bodyNode: ASTNode,
  tableRef: string,
  isGrouped: boolean,
  registry: ParameterRegistry,
  lambdaParams: Set<string>,
): ConversionResult {
  if (isGrouped) {
    // After GROUP BY, use group visitor (for HAVING clause)
    const context: SqlGroupVisitorContext = {
      registry,
      lambdaParams,
      tableRef,
      groupKeys: new Map(), // Would be populated from GROUP BY
    };
    const [expression, newRegistry] = visitGroupNode(bodyNode, context);
    return { expression, registry: newRegistry };
  } else {
    // Before GROUP BY, use row visitor
    const context: SqlRowVisitorContext = {
      registry,
      lambdaParams,
      tableRef,
    };
    const [expression, newRegistry] = visitRowNode(bodyNode, context);
    return { expression, registry: newRegistry };
  }
}
