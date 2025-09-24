/**
 * WHERE operation converter
 */

import type { WhereOperation, QueryOperation } from "../query-tree/operations.js";
import type { ColumnExpression, BooleanExpression } from "../expressions/expression.js";
import type {
  CallExpression as ASTCallExpression,
  ArrowFunctionExpression,
} from "../parser/ast-types.js";
import type { ConversionContext } from "./converter-utils.js";
import { getParameterName, isBooleanExpression } from "./converter-utils.js";
import { convertAstToExpression } from "./expressions.js";

export function convertWhereOperation(
  ast: ASTCallExpression,
  source: QueryOperation,
  context: ConversionContext,
): WhereOperation | null {
  if (ast.arguments && ast.arguments.length > 0) {
    const lambdaAst = ast.arguments[0];
    if (lambdaAst && lambdaAst.type === "ArrowFunctionExpression") {
      // Add the lambda parameter to table params
      const paramName = getParameterName(lambdaAst as ArrowFunctionExpression);
      if (paramName) {
        context.tableParams.add(paramName);
      }

      const body = (lambdaAst as ArrowFunctionExpression).body;
      const predicate =
        body.type === "BlockStatement" ? null : convertAstToExpression(body, context);

      // If we got a column, convert it to a booleanColumn for where clauses
      let finalPredicate = predicate;
      if (predicate && predicate.type === "column") {
        finalPredicate = {
          type: "booleanColumn",
          name: (predicate as unknown as ColumnExpression).name,
        };
      }

      if (finalPredicate && isBooleanExpression(finalPredicate)) {
        return {
          type: "queryOperation",
          operationType: "where",
          source,
          predicate: finalPredicate as unknown as BooleanExpression,
        };
      }
    }
  }
  return null;
}
