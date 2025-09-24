/**
 * GROUP BY operation converter
 */

import type { GroupByOperation, QueryOperation } from "../query-tree/operations.js";
import type {
  CallExpression as ASTCallExpression,
  ArrowFunctionExpression,
  Expression as ASTExpression,
} from "../parser/ast-types.js";
import type { ConversionContext } from "./converter-utils.js";
import { getParameterName, getReturnExpression } from "./converter-utils.js";
import { convertAstToExpression } from "./expressions.js";

export function convertGroupByOperation(
  ast: ASTCallExpression,
  source: QueryOperation,
  context: ConversionContext,
): GroupByOperation | null {
  if (ast.arguments && ast.arguments.length > 0) {
    const keySelectorAst = ast.arguments[0];

    if (keySelectorAst && keySelectorAst.type === "ArrowFunctionExpression") {
      const arrowFunc = keySelectorAst as ArrowFunctionExpression;
      const paramName = getParameterName(arrowFunc);
      if (paramName) {
        context.tableParams.add(paramName);
      }

      // Handle both Expression body and BlockStatement body
      let bodyExpr: ASTExpression | null = null;
      if (arrowFunc.body.type === "BlockStatement") {
        // For block statements, look for a return statement
        bodyExpr = getReturnExpression(arrowFunc.body.body);
      } else {
        bodyExpr = arrowFunc.body;
      }

      if (bodyExpr) {
        const keySelector = convertAstToExpression(bodyExpr, context);

        // Support any expression as key selector, including:
        // - Simple columns: u => u.name
        // - Object literals (composite keys): u => ({ name: u.name, dept: u.dept })
        // - Method calls: p => p.name.includes("e")
        // - Nested property access: joined => joined.user.name
        if (keySelector) {
          return {
            type: "queryOperation",
            operationType: "groupBy",
            source,
            keySelector,
          };
        }
      }
    }
  }
  return null;
}
