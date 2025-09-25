/**
 * Convert operation tree from parser to include expressions
 */

import type { QueryOperation } from "../query-tree/operations.js";
import type { RowExpression } from "../expressions/expression.js";
import { createRegistry, type ParameterRegistry } from "./parameter-registry.js";
import { parseJavaScript } from "../parser/oxc-parser.js";
import { convertWhere } from "./operations/sql-where.js";
import type { SqlExpression } from "../expressions/sql-expression.js";
import type { ASTNode } from "../parser/ast-types.js";

/**
 * Parse a lambda string into AST
 */
function parseLambda(lambda: string): any {
  const ast = parseJavaScript(lambda) as any;
  if (!ast || !ast.body || ast.body.length === 0) {
    throw new Error("Failed to parse lambda");
  }

  // The lambda should parse as a single expression statement
  const expr = ast.body[0].expression;
  if (!expr || expr.type !== "ArrowFunctionExpression") {
    throw new Error("Lambda must be an arrow function");
  }

  return expr;
}

/**
 * Convert an operation tree to include expressions and auto-parameters
 */
export function convertOperationTree(operation: QueryOperation): {
  operation: QueryOperation;
  autoParams: Record<string, any>;
} {
  // Start with an empty registry
  const registry = createRegistry();

  // Convert the operation tree recursively
  const { operation: convertedOp, registry: finalRegistry } = convertOperationRecursive(
    operation,
    registry,
    new Map<string, RowExpression>(),
  );

  // Extract auto-parameters from the registry
  const autoParams: Record<string, any> = {};
  for (const param of finalRegistry.parameters) {
    autoParams[param.name] = param.value;
  }

  return {
    operation: convertedOp,
    autoParams,
  };
}

function convertOperationRecursive(
  operation: QueryOperation,
  registry: ParameterRegistry,
  groupKeys: Map<string, RowExpression>,
): { operation: QueryOperation; registry: ParameterRegistry } {
  // First, convert the source operation if it exists
  let sourceOperation: QueryOperation | undefined;
  let currentRegistry = registry;
  let currentGroupKeys = groupKeys;

  if ("source" in operation && operation.source) {
    const sourceResult = convertOperationRecursive(
      operation.source,
      currentRegistry,
      currentGroupKeys,
    );
    sourceOperation = sourceResult.operation;
    currentRegistry = sourceResult.registry;

    // Check if source has GROUP BY
    if (hasGroupBy(sourceOperation)) {
      // Extract group keys if the immediate source is a GROUP BY
      if (sourceOperation.type === "groupBy") {
        const groupByOp = sourceOperation as any;
        if (groupByOp.keyExpression) {
          // For now, use a simple group key mapping
          currentGroupKeys = new Map([["group", groupByOp.keyExpression]]);
        }
      }
    }
  }

  // Check if we've gone through a GROUP BY
  const isGrouped = hasGroupBy(sourceOperation);

  // Now convert the current operation based on its type
  switch (operation.type) {
    case "table":
      // Table operations don't need conversion
      return { operation, registry: currentRegistry };

    case "where": {
      const whereOp = operation as any;
      if (!whereOp.predicate || !sourceOperation) {
        return { operation, registry: currentRegistry };
      }

      const tableRef = getTableRef(sourceOperation);

      // Parse the lambda
      const lambdaAst = parseLambda(whereOp.predicate);

      // Extract lambda parameters
      const lambdaParams = new Set<string>();
      for (const param of lambdaAst.params) {
        if (param.type === "Identifier") {
          lambdaParams.add(param.name);
        }
      }

      // Convert using SQL visitor
      const result = convertWhere(
        lambdaAst.body,
        tableRef,
        isGrouped,
        currentRegistry,
        lambdaParams,
      );

      const convertedOp = {
        ...whereOp,
        predicate: result.expression, // Replace lambda string with expression
        registry: result.registry,
      };

      return { operation: convertedOp, registry: result.registry };
    }

    case "select": {
      // TODO: Implement SELECT with SQL visitor
      const selectOp = operation as any;
      if (!sourceOperation) {
        return { operation, registry: currentRegistry };
      }
      return {
        operation: {
          ...selectOp,
          source: sourceOperation,
        },
        registry: currentRegistry,
      };
    }

    case "groupBy": {
      // TODO: Implement GROUP BY with SQL visitor
      const groupByOp = operation as any;
      if (!sourceOperation) {
        return { operation, registry: currentRegistry };
      }
      return {
        operation: {
          ...groupByOp,
          source: sourceOperation,
        },
        registry: currentRegistry,
      };
    }

    case "orderBy":
    case "orderByDescending": {
      const orderByOp = operation as any;
      if (!orderByOp.keySelector || !sourceOperation) {
        return { operation, registry: currentRegistry };
      }

      const tableRef = getTableRef(sourceOperation);

      // Parse the lambda
      const lambdaAst = parseLambda(orderByOp.keySelector);

      // Extract lambda parameters
      const lambdaParams = new Set<string>();
      for (const param of lambdaAst.params) {
        if (param.type === "Identifier") {
          lambdaParams.add(param.name);
        }
      }

      // Create context
      const context: ConversionContext = {
        isGrouped,
        groupKeys: currentGroupKeys,
        tableRef,
        lambdaParams,
        registry: currentRegistry,
      };

      // Convert
      const result = convertOrderBy(lambdaAst.body, context);

      const convertedOp = {
        ...orderByOp,
        expression: result.expression,
        registry: result.registry,
      };

      return { operation: convertedOp, registry: result.registry };
    }

    case "join": {
      const joinOp = operation as any;
      const outerOp = joinOp.outer;
      const innerOp = joinOp.inner;

      if (!outerOp || !innerOp) {
        return { operation, registry: currentRegistry };
      }

      // Convert outer and inner sources
      const outerResult = convertOperationRecursive(outerOp, currentRegistry, currentGroupKeys);
      const innerResult = convertOperationRecursive(innerOp, outerResult.registry, new Map());

      const outerRef = getTableRef(outerResult.operation);
      const innerRef = getTableRef(innerResult.operation);

      // Parse and convert outer key selector
      if (joinOp.outerKeySelector) {
        const outerKeyAst = parseLambda(joinOp.outerKeySelector);
        const outerParams = new Set<string>();
        for (const param of outerKeyAst.params) {
          if (param.type === "Identifier") {
            outerParams.add(param.name);
          }
        }

        const outerContext: ConversionContext = {
          isGrouped: false,
          groupKeys: new Map(),
          tableRef: outerRef,
          lambdaParams: outerParams,
          registry: innerResult.registry,
        };

        const outerKeyResult = convertJoin(outerKeyAst.body, outerContext);
        joinOp.outerKeyExpression = outerKeyResult.expression;
        currentRegistry = outerKeyResult.registry;
      }

      // Parse and convert inner key selector
      if (joinOp.innerKeySelector) {
        const innerKeyAst = parseLambda(joinOp.innerKeySelector);
        const innerParams = new Set<string>();
        for (const param of innerKeyAst.params) {
          if (param.type === "Identifier") {
            innerParams.add(param.name);
          }
        }

        const innerContext: ConversionContext = {
          isGrouped: false,
          groupKeys: new Map(),
          tableRef: innerRef,
          lambdaParams: innerParams,
          registry: currentRegistry,
        };

        const innerKeyResult = convertJoin(innerKeyAst.body, innerContext);
        joinOp.innerKeyExpression = innerKeyResult.expression;
        currentRegistry = innerKeyResult.registry;
      }

      const convertedOp = {
        ...joinOp,
        outer: outerResult.operation,
        inner: innerResult.operation,
        registry: currentRegistry,
      };

      return { operation: convertedOp, registry: currentRegistry };
    }

    case "skip": {
      const skipOp = operation as any;
      if (!sourceOperation) {
        return { operation, registry: currentRegistry };
      }

      // Create a minimal context for skip
      const context: ConversionContext = {
        isGrouped: false,
        groupKeys: new Map(),
        tableRef: getTableRef(sourceOperation),
        lambdaParams: new Set(),
        registry: currentRegistry,
      };

      const result = convertSkip(skipOp.count || 0, context);

      const convertedOp = {
        ...skipOp,
        source: sourceOperation,
        countExpression: result.expression,
        registry: result.registry,
      };

      return { operation: convertedOp, registry: result.registry };
    }

    case "take": {
      const takeOp = operation as any;
      if (!sourceOperation) {
        return { operation, registry: currentRegistry };
      }

      // Create a minimal context for take
      const context: ConversionContext = {
        isGrouped: false,
        groupKeys: new Map(),
        tableRef: getTableRef(sourceOperation),
        lambdaParams: new Set(),
        registry: currentRegistry,
      };

      const result = convertTake(takeOp.count || 1, context);

      const convertedOp = {
        ...takeOp,
        source: sourceOperation,
        countExpression: result.expression,
        registry: result.registry,
      };

      return { operation: convertedOp, registry: result.registry };
    }

    case "distinct":
      return {
        operation: {
          ...operation,
          source: sourceOperation,
        } as any,
        registry: currentRegistry,
      };

    default:
      return { operation, registry: currentRegistry };
  }
}

function hasGroupBy(operation: QueryOperation | undefined): boolean {
  if (!operation) return false;
  if (operation.type === "groupBy") return true;
  if ("source" in operation && operation.source) {
    return hasGroupBy(operation.source);
  }
  if (operation.type === "join" && "outer" in operation) {
    return hasGroupBy((operation as any).outer);
  }
  return false;
}

function getTableRef(operation: QueryOperation): string {
  if (operation.type === "table") {
    return (operation as any).table;
  }
  if ("source" in operation && operation.source) {
    return getTableRef(operation.source);
  }
  if (operation.type === "join" && "outer" in operation) {
    return getTableRef((operation as any).outer);
  }
  return "unknown";
}
