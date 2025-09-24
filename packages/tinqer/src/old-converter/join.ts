/**
 * JOIN operation converter
 */

import type {
  JoinOperation,
  QueryOperation,
  ResultShape,
  ShapeNode,
  ColumnShapeNode,
  ObjectShapeNode,
  ReferenceShapeNode,
} from "../query-tree/operations.js";
import type { ColumnExpression, Expression, ObjectExpression } from "../expressions/expression.js";
import type {
  CallExpression as ASTCallExpression,
  ArrowFunctionExpression,
  Expression as ASTExpression,
} from "../parser/ast-types.js";
import type { ConversionContext } from "./converter-utils.js";
import { getParameterName, getReturnExpression } from "./converter-utils.js";
import { convertAstToExpression } from "./expressions.js";
import { convertMethodChain } from "./ast-converter.js";

/**
 * Build a ResultShape from a JOIN result selector expression
 * Preserves full nested structure for complete fidelity
 */
function buildResultShape(
  expr: Expression | undefined,
  outerParam: string | null,
  innerParam: string | null,
): ResultShape | undefined {
  if (!expr || expr.type !== "object") {
    return undefined;
  }

  const rootNode = buildShapeNode(expr, outerParam, innerParam);
  if (rootNode && rootNode.type === "object") {
    return rootNode as ResultShape;
  }

  return undefined;
}

/**
 * Recursively build a ShapeNode from an expression
 */
function buildShapeNode(
  expr: Expression,
  outerParam: string | null,
  innerParam: string | null,
): ShapeNode | undefined {
  switch (expr.type) {
    case "object": {
      const objExpr = expr as ObjectExpression;
      const properties = new Map<string, ShapeNode>();

      for (const [propName, propExpr] of Object.entries(objExpr.properties)) {
        const node = buildShapeNode(propExpr, outerParam, innerParam);
        if (node) {
          properties.set(propName, node);
        }
      }

      return {
        type: "object",
        properties,
      } as ObjectShapeNode;
    }

    case "column": {
      const colExpr = expr as ColumnExpression;

      // Check if this is a $param marker from JOIN context
      if (colExpr.table && colExpr.table.startsWith("$param")) {
        const paramIndex = parseInt(colExpr.table.substring(6), 10);

        // Check if this is a direct reference to the entire parameter
        // (when colExpr.name matches the parameter name)
        if (
          (paramIndex === 0 && colExpr.name === outerParam) ||
          (paramIndex === 1 && colExpr.name === innerParam)
        ) {
          return {
            type: "reference",
            sourceTable: paramIndex,
          } as ReferenceShapeNode;
        }

        // Otherwise it's a column from that table
        return {
          type: "column",
          sourceTable: paramIndex,
          columnName: colExpr.name,
        } as ColumnShapeNode;
      }
      // Check if this is a property access (e.g., u.name)
      else if (colExpr.table === outerParam && outerParam) {
        return {
          type: "column",
          sourceTable: 0,
          columnName: colExpr.name,
        } as ColumnShapeNode;
      } else if (colExpr.table === innerParam && innerParam) {
        return {
          type: "column",
          sourceTable: 1,
          columnName: colExpr.name,
        } as ColumnShapeNode;
      } else if (!colExpr.table) {
        // Direct parameter reference (e.g., { orderItem: oi })
        // Check both table and column name cases
        if (
          (colExpr.name === outerParam && outerParam) ||
          (colExpr.table === outerParam && outerParam)
        ) {
          return {
            type: "reference",
            sourceTable: 0,
          } as ReferenceShapeNode;
        } else if (
          (colExpr.name === innerParam && innerParam) ||
          (colExpr.table === innerParam && innerParam)
        ) {
          return {
            type: "reference",
            sourceTable: 1,
          } as ReferenceShapeNode;
        }
      }
      break;
    }

    // Add more cases as needed (arithmetic, concat, etc.)
  }

  return undefined;
}

export function convertJoinOperation(
  ast: ASTCallExpression,
  source: QueryOperation,
  context: ConversionContext,
): JoinOperation | null {
  if (ast.arguments && ast.arguments.length >= 4) {
    // join(inner, outerKeySelector, innerKeySelector, resultSelector)
    const firstArg = ast.arguments[0];
    const innerSource = firstArg ? convertMethodChain(firstArg as ASTExpression, context) : null;
    const outerKeySelectorAst = ast.arguments[1];
    const innerKeySelectorAst = ast.arguments[2];
    const resultSelectorAst = ast.arguments[3]; // Capture the result selector

    let outerKey: string | null = null;
    let innerKey: string | null = null;
    let outerKeySource: number | undefined = undefined;
    let outerParam: string | null = null;
    let innerParam: string | null = null;

    // Check if source operation is a JOIN with a result shape
    const sourceJoin = source.operationType === "join" ? (source as JoinOperation) : null;
    const previousResultShape = sourceJoin?.resultShape;

    // Process outer key selector
    if (outerKeySelectorAst && outerKeySelectorAst.type === "ArrowFunctionExpression") {
      const outerArrow = outerKeySelectorAst as ArrowFunctionExpression;
      const paramName = getParameterName(outerArrow);

      // Create a context with the result shape if we're chaining JOINs
      const outerContext = { ...context };
      if (paramName && previousResultShape) {
        outerContext.currentResultShape = previousResultShape;
        outerContext.joinResultParam = paramName;
      } else if (paramName) {
        context.tableParams.add(paramName);
      }

      // Handle both Expression body and BlockStatement body
      let bodyExpr: ASTExpression | null = null;
      if (outerArrow.body.type === "BlockStatement") {
        // For block statements, look for a return statement
        bodyExpr = getReturnExpression(outerArrow.body.body);
      } else {
        bodyExpr = outerArrow.body;
      }

      if (bodyExpr) {
        const expr = convertAstToExpression(bodyExpr, outerContext);
        if (expr && expr.type === "column") {
          const colExpr = expr as ColumnExpression;
          // For nested paths like orderItem.product_id, we get the final column name
          outerKey = colExpr.name;

          // Track which source table this key comes from
          if (colExpr.table && colExpr.table.startsWith("$joinSource")) {
            outerKeySource = parseInt(colExpr.table.substring(11), 10);
          }
        }
      }
    }

    if (innerKeySelectorAst && innerKeySelectorAst.type === "ArrowFunctionExpression") {
      const innerArrow = innerKeySelectorAst as ArrowFunctionExpression;
      const paramName = getParameterName(innerArrow);
      if (paramName) {
        context.tableParams.add(paramName);
      }

      // Handle both Expression body and BlockStatement body
      let bodyExpr: ASTExpression | null = null;
      if (innerArrow.body.type === "BlockStatement") {
        // For block statements, look for a return statement
        bodyExpr = getReturnExpression(innerArrow.body.body);
      } else {
        bodyExpr = innerArrow.body;
      }

      if (bodyExpr) {
        const expr = convertAstToExpression(bodyExpr, context);
        if (expr && expr.type === "column") {
          innerKey = (expr as ColumnExpression).name;
        }
      }
    }

    // Process the result selector
    let resultSelector: Expression | undefined = undefined;
    if (resultSelectorAst && resultSelectorAst.type === "ArrowFunctionExpression") {
      const resultArrow = resultSelectorAst as ArrowFunctionExpression;

      // Store the parameter names for the result selector
      // These will be needed to map properties back to their source tables
      const params = resultArrow.params;
      outerParam =
        params && params[0]
          ? getParameterName({
              params: [params[0]],
              body: resultArrow.body,
            } as ArrowFunctionExpression)
          : null;
      innerParam =
        params && params[1]
          ? getParameterName({
              params: [params[1]],
              body: resultArrow.body,
            } as ArrowFunctionExpression)
          : null;

      // Create a special context that tracks which parameter maps to which table
      const resultContext = {
        ...context,
        joinParams: new Map<string, number>(), // parameter name -> table index (0 for outer, 1 for inner)
      };

      // If we're chaining JOINs and the outer param comes from a previous JOIN result,
      // pass through its shape information
      if (outerParam && previousResultShape) {
        resultContext.currentResultShape = previousResultShape;
        resultContext.joinResultParam = outerParam;
      }

      if (outerParam) {
        resultContext.joinParams?.set(outerParam, 0);
        resultContext.tableParams.add(outerParam); // Also add to tableParams for validation
      }
      if (innerParam) {
        resultContext.joinParams?.set(innerParam, 1);
        resultContext.tableParams.add(innerParam); // Also add to tableParams for validation
      }

      // Convert the result selector body to an expression
      let bodyExpr: ASTExpression | null = null;
      if (resultArrow.body.type === "BlockStatement") {
        bodyExpr = getReturnExpression(resultArrow.body.body);
      } else {
        bodyExpr = resultArrow.body;
      }

      if (bodyExpr) {
        resultSelector = convertAstToExpression(bodyExpr, resultContext) || undefined;
      }
    }

    if (innerSource && outerKey && innerKey) {
      // Build the result shape from the result selector
      const resultShape = buildResultShape(resultSelector, outerParam, innerParam);

      return {
        type: "queryOperation",
        operationType: "join",
        source,
        inner: innerSource,
        outerKey,
        innerKey,
        outerKeySource, // Track which source table the key comes from
        resultSelector, // Include the result selector
        resultShape, // Include the result shape
      };
    }
  }
  return null;
}
