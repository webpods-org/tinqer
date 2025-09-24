/**
 * FROM operation converter
 */

import type { FromOperation } from "../query-tree/operations.js";
import type { CallExpression as ASTCallExpression } from "../parser/ast-types.js";
import type { StringLiteral, Literal } from "../parser/ast-types.js";
import type { ConversionContext } from "./converter-utils.js";

export function convertFromOperation(
  ast: ASTCallExpression,
  context: ConversionContext,
): FromOperation | null {
  if (ast.arguments && ast.arguments.length > 0) {
    // Handle both from("table") and from(db, "table") patterns
    let tableArg;
    if (ast.arguments.length === 1) {
      // from("table") - single argument
      tableArg = ast.arguments[0];
    } else if (ast.arguments.length === 2) {
      // from(db, "table") - two arguments, second is table name
      tableArg = ast.arguments[1];
    }

    if (tableArg && (tableArg.type === "StringLiteral" || tableArg.type === "Literal")) {
      const tableName = (tableArg as StringLiteral | Literal).value as string;
      context.currentTable = tableName;
      return {
        type: "queryOperation",
        operationType: "from",
        table: tableName,
      };
    }
  }
  return null;
}
