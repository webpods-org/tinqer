/**
 * CONTAINS operation converter
 */

import type { ContainsOperation, QueryOperation } from "../query-tree/operations.js";
import type { ValueExpression } from "../expressions/expression.js";
import type { CallExpression as ASTCallExpression } from "../parser/ast-types.js";
import type { ConversionContext } from "./converter-utils.js";
import { isValueExpression } from "./converter-utils.js";
import { convertAstToExpression } from "./expressions.js";

export function convertContainsOperation(
  ast: ASTCallExpression,
  source: QueryOperation,
  context: ConversionContext,
): ContainsOperation | null {
  if (ast.arguments && ast.arguments.length > 0) {
    const valueArg = ast.arguments[0];
    if (valueArg) {
      const value = convertAstToExpression(valueArg, context);

      if (value && isValueExpression(value)) {
        return {
          type: "queryOperation",
          operationType: "contains",
          source,
          value: value as ValueExpression,
        };
      }
    }
  }
  return null;
}
