/**
 * ANY operation converter
 */

import type { AnyOperation, QueryOperation } from "../query-tree/operations.js";
import type {
  BooleanExpression,
  ColumnExpression,
  BooleanColumnExpression,
} from "../expressions/expression.js";
import type {
  CallExpression as ASTCallExpression,
  ArrowFunctionExpression,
  Expression as ASTExpression,
} from "../parser/ast-types.js";
import type { ConversionContext } from "./converter-utils.js";
import { getParameterName, getReturnExpression, isBooleanExpression } from "./converter-utils.js";
import { convertAstToExpression } from "./expressions.js";

export function convertAnyOperation(
  ast: ASTCallExpression,
  source: QueryOperation,
  context: ConversionContext,
): AnyOperation | null {
  let predicate: BooleanExpression | undefined;

  if (ast.arguments && ast.arguments.length > 0) {
    const lambdaAst = ast.arguments[0];
    if (lambdaAst && lambdaAst.type === "ArrowFunctionExpression") {
      const arrowFunc = lambdaAst as ArrowFunctionExpression;
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
        const expr = convertAstToExpression(bodyExpr, context);
        if (expr) {
          if (isBooleanExpression(expr)) {
            predicate = expr as BooleanExpression;
          } else if (expr.type === "column") {
            // If we get a column expression in a predicate context,
            // treat it as a boolean column
            predicate = {
              type: "booleanColumn",
              name: (expr as ColumnExpression).name,
            } as BooleanColumnExpression;
          }
        }
      }
    }
  }

  return {
    type: "queryOperation",
    operationType: "any",
    source,
    predicate,
  };
}
