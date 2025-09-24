/**
 * ALL operation converter
 */

import type { AllOperation, QueryOperation } from "../query-tree/operations.js";
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

export function convertAllOperation(
  ast: ASTCallExpression,
  source: QueryOperation,
  context: ConversionContext,
): AllOperation | null {
  // all() requires a predicate
  if (!ast.arguments || ast.arguments.length !== 1) {
    return null;
  }

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
        let predicate: BooleanExpression;
        if (isBooleanExpression(expr)) {
          predicate = expr as BooleanExpression;
        } else if (expr.type === "column") {
          // If we get a column expression in a predicate context,
          // treat it as a boolean column
          predicate = {
            type: "booleanColumn",
            name: (expr as ColumnExpression).name,
          } as BooleanColumnExpression;
        } else {
          return null;
        }

        return {
          type: "queryOperation",
          operationType: "all",
          source,
          predicate,
        };
      }
    }
  }

  return null;
}
