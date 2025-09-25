/**
 * Group visitor that produces SQL-friendly expression types
 * Used after GROUP BY for handling aggregates and group references
 */

import type {
  GroupKeyExpression,
  AggregateExpression,
  SqlExpression,
  ValueExpression,
  BooleanExpression,
} from "../../expressions/sql-expression.js";
import type { ParameterRegistry } from "../parameter-registry.js";
import type { ASTNode } from "../../parser/ast-types.js";
import { visitNode as visitRowNode, type SqlRowVisitorContext } from "./sql-row-visitor.js";

export interface SqlGroupVisitorContext {
  registry: ParameterRegistry;
  lambdaParams: Set<string>;
  tableRef: string;
  groupKeys: Map<string, SqlExpression>; // Maps group param to key expression
}

export type SqlGroupVisitorResult = [SqlExpression, ParameterRegistry];

/**
 * Visit an identifier in group context
 */
export function visitIdentifier(
  node: ASTNode & { name: string },
  context: SqlGroupVisitorContext,
): SqlGroupVisitorResult {
  // Check if it's the group parameter
  if (context.lambdaParams.has(node.name)) {
    // This represents the group itself - will be used with .key or in aggregates
    // Return a placeholder that will be resolved by member access
    return [{ type: "param", name: node.name }, context.registry];
  }

  // Otherwise it's an external parameter
  return [{ type: "param", name: node.name }, context.registry];
}

/**
 * Visit a member expression in group context
 */
export function visitMemberExpression(
  node: ASTNode & { object: ASTNode; property: ASTNode },
  context: SqlGroupVisitorContext,
): SqlGroupVisitorResult {
  // Check if it's accessing .key on the group parameter
  if (
    node.object.type === "Identifier" &&
    context.lambdaParams.has((node.object as any).name) &&
    !node.computed &&
    (node.property as any).name === "key"
  ) {
    // This is the group key reference
    const groupKey: GroupKeyExpression = {
      type: "groupKey",
    };
    return [groupKey, context.registry];
  }

  // Otherwise delegate to row visitor
  const rowContext: SqlRowVisitorContext = {
    registry: context.registry,
    lambdaParams: new Set(), // Don't treat group param as table ref
    tableRef: context.tableRef,
  };
  return visitRowNode(node, rowContext);
}

/**
 * Visit a call expression in group context
 */
export function visitCallExpression(
  node: ASTNode & { callee: ASTNode; arguments: ASTNode[] },
  context: SqlGroupVisitorContext,
): SqlGroupVisitorResult {
  // Check for aggregate functions
  if (node.callee.type === "Identifier") {
    const funcName = (node.callee as any).name.toUpperCase();
    const aggregateFunctions = ["COUNT", "SUM", "AVG", "MIN", "MAX", "STRING_AGG", "ARRAY_AGG"];

    if (aggregateFunctions.includes(funcName)) {
      // Handle aggregate function
      let expression: ValueExpression | undefined;
      let registry = context.registry;

      if (node.arguments.length > 0) {
        // For aggregates like SUM(g, x => x.amount), skip the group parameter
        const hasGroupParam =
          node.arguments.length > 1 &&
          node.arguments[0]!.type === "Identifier" &&
          context.lambdaParams.has((node.arguments[0] as any).name);

        const exprArg = hasGroupParam ? node.arguments[1] : node.arguments[0];

        if (exprArg) {
          // If it's a lambda, extract the body
          if (exprArg.type === "ArrowFunctionExpression") {
            const lambdaNode = exprArg as any;
            const lambdaParams = new Set<string>();
            for (const param of lambdaNode.params) {
              if (param.type === "Identifier") {
                lambdaParams.add(param.name);
              }
            }

            // Use row visitor for the lambda body
            const rowContext: SqlRowVisitorContext = {
              registry,
              lambdaParams,
              tableRef: context.tableRef,
            };
            const [expr, newReg] = visitRowNode(lambdaNode.body, rowContext);
            expression = expr as ValueExpression;
            registry = newReg;
          } else {
            // Direct expression
            const [expr, newReg] = visitNode(exprArg, { ...context, registry });
            expression = expr as ValueExpression;
            registry = newReg;
          }
        }
      }

      const aggregate: AggregateExpression = {
        type: "aggregate",
        function: funcName as AggregateExpression["function"],
        expression,
      };

      return [aggregate, registry];
    }
  }

  // Otherwise delegate to row visitor
  const rowContext: SqlRowVisitorContext = {
    registry: context.registry,
    lambdaParams: new Set(),
    tableRef: context.tableRef,
  };
  return visitRowNode(node, rowContext);
}

/**
 * Main visitor dispatcher for group context
 */
export function visitNode(node: ASTNode, context: SqlGroupVisitorContext): SqlGroupVisitorResult {
  switch (node.type) {
    case "Identifier":
      return visitIdentifier(node as any, context);

    case "MemberExpression":
      return visitMemberExpression(node as any, context);

    case "CallExpression":
      return visitCallExpression(node as any, context);

    default:
      // For all other node types, delegate to row visitor
      const rowContext: SqlRowVisitorContext = {
        registry: context.registry,
        lambdaParams: new Set(), // Don't treat group param as table ref
        tableRef: context.tableRef,
      };
      return visitRowNode(node, rowContext);
  }
}
