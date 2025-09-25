/**
 * Simplified convert operation tree using SQL visitors
 */

import type {
  QueryOperation,
  WhereOperation,
  TakeOperation,
  SkipOperation,
} from "../query-tree/operations.js";
import { createRegistry, addParameter, type ParameterRegistry } from "./parameter-registry.js";
import { parseJavaScript } from "../parser/oxc-parser.js";
import { convertWhere } from "./operations/sql-where.js";
import type { ASTNode } from "../parser/ast-types.js";

/**
 * Parse a lambda string into AST
 */
function parseLambda(lambda: string): ASTNode {
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
  autoParams: Record<string, string | number | boolean | null>;
} {
  // Start with an empty registry
  const registry = createRegistry();

  // Convert the operation tree recursively
  const { operation: convertedOp, registry: finalRegistry } = convertOperationRecursive(
    operation,
    registry,
  );

  // Extract auto-parameters from the registry
  const autoParams: Record<string, string | number | boolean | null> = {};
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
): { operation: QueryOperation; registry: ParameterRegistry } {
  // First, convert the source operation if it exists
  let sourceOperation: QueryOperation | undefined;
  let currentRegistry = registry;

  if ("source" in operation && operation.source) {
    const sourceResult = convertOperationRecursive(operation.source, currentRegistry);
    sourceOperation = sourceResult.operation;
    currentRegistry = sourceResult.registry;
  }

  // Check if we've gone through a GROUP BY
  const isGrouped = hasGroupBy(sourceOperation);

  // Now convert the current operation based on its type
  switch (operation.type) {
    case "from":
    case "table":
      // Table/From operations don't need conversion
      return { operation, registry: currentRegistry };

    case "where": {
      const whereOp = operation as WhereOperation;
      if (!whereOp.predicate || !sourceOperation) {
        return { operation, registry: currentRegistry };
      }

      const tableRef = getTableRef(sourceOperation);

      // Parse the lambda
      const lambdaAst = parseLambda(whereOp.predicate as string);

      // Extract lambda parameters
      const lambdaParams = new Set<string>();
      for (const param of lambdaAst.params) {
        if (param.type === "Identifier") {
          lambdaParams.add((param as { name: string }).name);
        }
      }

      // Convert using SQL visitor
      const result = convertWhere(
        lambdaAst.body as ASTNode,
        tableRef,
        isGrouped,
        currentRegistry,
        lambdaParams,
      );

      const convertedOp: WhereOperation = {
        ...whereOp,
        source: sourceOperation,
        predicate: result.expression, // Replace lambda string with expression
        registry: result.registry,
      };

      return { operation: convertedOp, registry: result.registry };
    }

    case "take": {
      const takeOp = operation as TakeOperation;
      if (!sourceOperation) {
        return { operation, registry: currentRegistry };
      }

      // Auto-parameterize the count if it's a number
      if (typeof takeOp.count === "number") {
        const [newRegistry, paramName] = addParameter(currentRegistry, takeOp.count);
        const convertedOp: TakeOperation = {
          ...takeOp,
          source: sourceOperation,
          count: { type: "param", param: paramName },
        };
        return { operation: convertedOp, registry: newRegistry };
      }

      return {
        operation: { ...takeOp, source: sourceOperation },
        registry: currentRegistry,
      };
    }

    case "skip": {
      const skipOp = operation as SkipOperation;
      if (!sourceOperation) {
        return { operation, registry: currentRegistry };
      }

      // Auto-parameterize the count if it's a number
      if (typeof skipOp.count === "number") {
        const [newRegistry, paramName] = addParameter(currentRegistry, skipOp.count);
        const convertedOp: SkipOperation = {
          ...skipOp,
          source: sourceOperation,
          count: { type: "param", param: paramName },
        };
        return { operation: convertedOp, registry: newRegistry };
      }

      return {
        operation: { ...skipOp, source: sourceOperation },
        registry: currentRegistry,
      };
    }

    default:
      // For all other operations, just pass through with source
      if (sourceOperation) {
        return {
          operation: {
            ...operation,
            source: sourceOperation,
          } as any,
          registry: currentRegistry,
        };
      }
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
  if (operation.type === "table" || operation.type === "from") {
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
