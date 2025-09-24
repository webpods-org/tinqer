/**
 * SELECT operation converter
 */

import type { SelectOperation, QueryOperation } from "../query-tree/operations.js";
import type { ValueExpression, ObjectExpression } from "../expressions/expression.js";
import type {
  CallExpression as ASTCallExpression,
  ArrowFunctionExpression,
} from "../parser/ast-types.js";
import type { ConversionContext } from "./converter-utils.js";
import { getParameterName, isValueExpression, isObjectExpression } from "./converter-utils.js";
import { convertAstToExpression } from "./expressions.js";

export function convertSelectOperation(
  ast: ASTCallExpression,
  source: QueryOperation,
  context: ConversionContext,
): SelectOperation | null {
  if (ast.arguments && ast.arguments.length > 0) {
    const lambdaAst = ast.arguments[0];
    if (lambdaAst && lambdaAst.type === "ArrowFunctionExpression") {
      const paramName = getParameterName(lambdaAst as ArrowFunctionExpression);

      // Check if the source is a GROUP BY operation
      // In that case, the parameter represents IGrouping<TKey, TElement>
      if (source && source.operationType === "groupBy") {
        if (paramName) {
          // Mark this as a grouping parameter for aggregate method detection
          if (!context.groupingParams) {
            context.groupingParams = new Set();
          }
          context.groupingParams.add(paramName);
          // Also add to tableParams for regular member access (like g.key)
          context.tableParams.add(paramName);
        }
      } else {
        // Regular select - just add to table params
        if (paramName) {
          context.tableParams.add(paramName);
        }
      }

      const body = (lambdaAst as ArrowFunctionExpression).body;

      // Set flag to indicate we're in a SELECT projection
      // Modify context in place to avoid counter desync
      const previousInSelect = context.inSelectProjection;
      const previousHasTableParam = context.hasTableParam;
      context.inSelectProjection = true;
      context.hasTableParam = paramName !== null;

      // Special case: identity selector (e.g., .select(u => u))
      // This should select all columns (SELECT *)
      if (body.type === "Identifier" && paramName && body.name === paramName) {
        // Restore context
        context.inSelectProjection = previousInSelect;
        context.hasTableParam = previousHasTableParam;
        // Return select with null selector to indicate SELECT *
        return {
          type: "queryOperation",
          operationType: "select",
          source,
          selector: null as unknown as ValueExpression | ObjectExpression,
        };
      }

      const selector =
        body.type === "BlockStatement" ? null : convertAstToExpression(body, context);

      // Restore context
      context.inSelectProjection = previousInSelect;
      context.hasTableParam = previousHasTableParam;

      if (selector && (isValueExpression(selector) || isObjectExpression(selector))) {
        return {
          type: "queryOperation",
          operationType: "select",
          source,
          selector: selector as ValueExpression | ObjectExpression,
        };
      }
    }
  }
  return null;
}
