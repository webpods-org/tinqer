/**
 * SKIP operation converter
 */

import type { SkipOperation, QueryOperation, ParamRef } from "../query-tree/operations.js";
import type { ParameterExpression } from "../expressions/expression.js";
import type {
  CallExpression as ASTCallExpression,
  NumericLiteral,
  Literal,
} from "../parser/ast-types.js";
import type { ConversionContext } from "./converter-utils.js";
import { convertAstToExpression } from "./expressions.js";
import { createAutoParam } from "./converter-utils.js";

export function convertSkipOperation(
  ast: ASTCallExpression,
  source: QueryOperation,
  context: ConversionContext,
): SkipOperation | null {
  if (ast.arguments && ast.arguments.length > 0) {
    const arg = ast.arguments[0];
    if (!arg) return null;

    // Handle numeric literals - auto-parameterize them
    if (arg.type === "NumericLiteral" || arg.type === "Literal") {
      // Auto-parameterize the offset value
      const value =
        arg.type === "NumericLiteral"
          ? (arg as NumericLiteral).value
          : ((arg as Literal).value as number);

      // Create auto-parameter with field context
      const paramName = createAutoParam(context, value, {
        fieldName: "OFFSET",
      });

      return {
        type: "queryOperation",
        operationType: "skip",
        source,
        count: { type: "param", param: paramName },
      };
    }

    // Handle any expression (including arithmetic, member access, etc.)
    const expr = convertAstToExpression(arg, context);
    if (expr) {
      // If it's a simple parameter reference, use it directly
      if (expr.type === "param") {
        return {
          type: "queryOperation",
          operationType: "skip",
          source,
          count: expr as ParameterExpression,
        };
      }

      // For other expressions (like arithmetic), use the expression directly
      // Note: This may be an arithmetic expression or other ValueExpression
      return {
        type: "queryOperation",
        operationType: "skip",
        source,
        count: expr as unknown as number | ParamRef, // Type assertion needed due to ValueExpression mismatch
      };
    }
  }
  return null;
}
