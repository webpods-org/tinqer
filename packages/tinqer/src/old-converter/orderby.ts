/**
 * ORDER BY and THEN BY operation converters
 */

import type {
  OrderByOperation,
  ThenByOperation,
  QueryOperation,
} from "../query-tree/operations.js";
import type { ValueExpression, ColumnExpression } from "../expressions/expression.js";
import type {
  CallExpression as ASTCallExpression,
  ArrowFunctionExpression,
  Expression as ASTExpression,
} from "../parser/ast-types.js";
import type { ConversionContext } from "./converter-utils.js";
import { getParameterName, getReturnExpression } from "./converter-utils.js";
import { convertAstToExpression } from "./expressions.js";

export function convertOrderByOperation(
  ast: ASTCallExpression,
  source: QueryOperation,
  context: ConversionContext,
  methodName: string,
): OrderByOperation | null {
  if (ast.arguments && ast.arguments.length > 0) {
    const lambdaAst = ast.arguments[0];
    if (lambdaAst && lambdaAst.type === "ArrowFunctionExpression") {
      const paramName = getParameterName(lambdaAst as ArrowFunctionExpression);
      if (paramName) {
        context.tableParams.add(paramName);
      }

      const body = (lambdaAst as ArrowFunctionExpression).body;
      const keySelector =
        body.type === "BlockStatement" ? null : convertAstToExpression(body, context);

      if (keySelector) {
        // For simple columns, just use the string name
        // For computed expressions, use the full expression
        const selector =
          keySelector.type === "column"
            ? (keySelector as ColumnExpression).name
            : (keySelector as ValueExpression);

        return {
          type: "queryOperation",
          operationType: "orderBy",
          source,
          keySelector: selector,
          descending: methodName === "orderByDescending",
        };
      }
    }
  }
  return null;
}

export function convertThenByOperation(
  ast: ASTCallExpression,
  source: QueryOperation,
  context: ConversionContext,
  methodName: string,
): ThenByOperation | null {
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
        const keySelector = convertAstToExpression(bodyExpr, context);

        if (keySelector) {
          // For simple columns, just use the string name
          // For computed expressions, use the full expression
          const selector =
            keySelector.type === "column"
              ? (keySelector as ColumnExpression).name
              : (keySelector as ValueExpression);

          return {
            type: "queryOperation",
            operationType: "thenBy",
            source,
            keySelector: selector,
            descending: methodName === "thenByDescending",
          };
        }
      }
    }
  }
  return null;
}
