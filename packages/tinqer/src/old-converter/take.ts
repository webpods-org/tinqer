/**
 * TAKE operation converter
 */

import type { TakeOperation, QueryOperation } from "../query-tree/operations.js";
import type {
  CallExpression as ASTCallExpression,
  NumericLiteral,
  Literal,
  MemberExpression as ASTMemberExpression,
  Identifier,
} from "../parser/ast-types.js";
import type { ConversionContext } from "./converter-utils.js";
import { createAutoParam } from "./converter-utils.js";

export function convertTakeOperation(
  ast: ASTCallExpression,
  source: QueryOperation,
  context: ConversionContext,
): TakeOperation | null {
  if (ast.arguments && ast.arguments.length > 0) {
    const arg = ast.arguments[0];
    if (!arg) return null;

    if (arg.type === "NumericLiteral" || arg.type === "Literal") {
      // Auto-parameterize the limit value
      const value =
        arg.type === "NumericLiteral"
          ? (arg as NumericLiteral).value
          : ((arg as Literal).value as number);

      // Create auto-parameter with field context
      const paramName = createAutoParam(context, value, {
        fieldName: "LIMIT",
      });

      return {
        type: "queryOperation",
        operationType: "take",
        source,
        count: { type: "param", param: paramName },
      };
    }
    // Handle external parameter (e.g., p.limit)
    if (arg.type === "MemberExpression") {
      const memberExpr = arg as ASTMemberExpression;
      if (memberExpr.object.type === "Identifier" && memberExpr.property.type === "Identifier") {
        const objectName = (memberExpr.object as Identifier).name;
        const propertyName = (memberExpr.property as Identifier).name;
        if (context.queryParams.has(objectName)) {
          return {
            type: "queryOperation",
            operationType: "take",
            source,
            count: { type: "param", param: objectName, property: propertyName },
          };
        }
      }
    }
  }
  return null;
}
