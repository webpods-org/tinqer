/**
 * Main converter module that orchestrates AST to expression tree conversion
 */

import type { QueryOperation } from "../query-tree/operations.js";
import type { Expression, RowExpression, GroupExpression } from "../expressions/expression.js";
import type { ParameterRegistry } from "./parameter-registry.js";
import { createRegistry, addParameter } from "./parameter-registry.js";
import { parseQuery } from "./parse-query.js";
import { convertWhere } from "./operations/where.js";
import { convertSelect } from "./operations/select.js";
import { convertGroupBy } from "./operations/group-by.js";
import { convertOrderBy } from "./operations/order-by.js";
import { convertJoin } from "./operations/join.js";

export interface ConversionContext {
  isGrouped: boolean; // Whether we're after a GROUP BY
  groupKeys?: Map<string, RowExpression>; // Maps group parameter to key expression
  tableRef: string;
  lambdaParams: Set<string>;
  registry: ParameterRegistry;
}

export interface ConversionResult<T = Expression> {
  expression: T;
  registry: ParameterRegistry;
}

/**
 * Convert a lambda string to an expression tree with parameters
 */
export function convertLambdaToExpression(
  lambda: string,
  operation: "where" | "select" | "orderBy" | "groupBy" | "join",
  tableRef: string,
  isGrouped: boolean = false,
  groupKeys?: Map<string, RowExpression>
): ConversionResult {
  const ast = parseQuery(lambda);

  if (ast.type !== "ArrowFunctionExpression") {
    throw new Error("Lambda must be an arrow function");
  }

  // Extract lambda parameters
  const lambdaParams = new Set<string>();
  for (const param of ast.params) {
    if (param.type === "Identifier") {
      lambdaParams.add(param.name);
    } else {
      throw new Error("Lambda parameters must be simple identifiers");
    }
  }

  // Create initial context
  const context: ConversionContext = {
    isGrouped,
    groupKeys,
    tableRef,
    lambdaParams,
    registry: createRegistry(),
  };

  // Route to appropriate converter based on operation
  switch (operation) {
    case "where":
      return convertWhere(ast.body, context);
    case "select":
      return convertSelect(ast.body, context);
    case "groupBy":
      return convertGroupBy(ast.body, context);
    case "orderBy":
      return convertOrderBy(ast.body, context);
    case "join":
      return convertJoin(ast.body, context);
    default:
      throw new Error(`Unsupported operation: ${operation}`);
  }
}

/**
 * Convert a QueryOperation tree to include expression trees
 */
export function convertQueryOperation(
  operation: QueryOperation,
  parentContext?: ConversionContext
): QueryOperation {
  const context = parentContext || {
    isGrouped: false,
    tableRef: operation.type === "table" ? operation.table : "unknown",
    lambdaParams: new Set<string>(),
    registry: createRegistry(),
  };

  switch (operation.type) {
    case "table":
      return operation; // No conversion needed

    case "where": {
      const source = convertQueryOperation(operation.source, context);
      const { expression, registry } = convertLambdaToExpression(
        operation.predicate,
        "where",
        context.tableRef,
        context.isGrouped,
        context.groupKeys
      );
      return {
        ...operation,
        source,
        expression,
        registry,
      };
    }

    case "select": {
      const source = convertQueryOperation(operation.source, context);
      const { expression, registry } = convertLambdaToExpression(
        operation.projection,
        "select",
        context.tableRef,
        context.isGrouped,
        context.groupKeys
      );
      return {
        ...operation,
        source,
        expression,
        registry,
      };
    }

    case "groupBy": {
      const source = convertQueryOperation(operation.source, context);
      const { expression, registry } = convertLambdaToExpression(
        operation.keySelector,
        "groupBy",
        context.tableRef,
        false // GROUP BY key selector operates on rows
      ) as ConversionResult<RowExpression>;

      // After GROUP BY, context changes - parameter now represents group
      const newContext: ConversionContext = {
        ...context,
        isGrouped: true,
        groupKeys: new Map([[operation.elementSelector ? "g" : "group", expression]]),
        registry,
      };

      // If there's an element selector, convert it
      let elementExpression: GroupExpression | undefined;
      let elementRegistry = registry;
      if (operation.elementSelector) {
        const result = convertLambdaToExpression(
          operation.elementSelector,
          "select",
          context.tableRef,
          true,
          newContext.groupKeys
        ) as ConversionResult<GroupExpression>;
        elementExpression = result.expression;
        elementRegistry = result.registry;
      }

      return {
        ...operation,
        source,
        keyExpression: expression,
        elementExpression,
        registry: elementRegistry,
      };
    }

    case "orderBy":
    case "orderByDescending": {
      const source = convertQueryOperation(operation.source, context);
      const { expression, registry } = convertLambdaToExpression(
        operation.keySelector,
        "orderBy",
        context.tableRef,
        context.isGrouped,
        context.groupKeys
      );
      return {
        ...operation,
        source,
        expression,
        registry,
      };
    }

    case "join": {
      const outer = convertQueryOperation(operation.outer, context);
      const inner = convertQueryOperation(operation.inner, context);

      // Parse the key selectors
      const outerResult = convertLambdaToExpression(
        operation.outerKeySelector,
        "join",
        context.tableRef,
        false
      ) as ConversionResult<RowExpression>;

      const innerResult = convertLambdaToExpression(
        operation.innerKeySelector,
        "join",
        operation.inner.type === "table" ? operation.inner.table : "inner",
        false
      ) as ConversionResult<RowExpression>;

      // Parse the result selector if present
      let resultExpression: RowExpression | undefined;
      let resultRegistry = innerResult.registry;
      if (operation.resultSelector) {
        const result = convertLambdaToExpression(
          operation.resultSelector,
          "select",
          context.tableRef,
          false
        ) as ConversionResult<RowExpression>;
        resultExpression = result.expression;
        resultRegistry = result.registry;
      }

      return {
        ...operation,
        outer,
        inner,
        outerKeyExpression: outerResult.expression,
        innerKeyExpression: innerResult.expression,
        resultExpression,
        registry: resultRegistry,
      };
    }

    case "distinct": {
      const source = convertQueryOperation(operation.source, context);
      return {
        ...operation,
        source,
      };
    }

    case "skip": {
      const source = convertQueryOperation(operation.source, context);
      // Convert count to expression if it's not already
      const registry = createRegistry();
      const [newRegistry] = addParameter(registry, operation.count);
      return {
        ...operation,
        source,
        countExpression: { type: "constant", value: operation.count },
        registry: newRegistry,
      };
    }

    case "take": {
      const source = convertQueryOperation(operation.source, context);
      // Convert count to expression if it's not already
      const registry = createRegistry();
      const [newRegistry] = addParameter(registry, operation.count);
      return {
        ...operation,
        source,
        countExpression: { type: "constant", value: operation.count },
        registry: newRegistry,
      };
    }

    default:
      throw new Error(`Unsupported operation type: ${(operation as any).type}`);
  }
}

// Re-export for convenience
export { createRegistry, addParameter, getParametersObject } from "./parameter-registry.js";
export type { ParameterRegistry } from "./parameter-registry.js";