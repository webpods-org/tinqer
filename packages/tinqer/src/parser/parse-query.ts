/**
 * Main parsing function for query builder functions
 */

import type { QueryOperation } from "../query-tree/operations.js";
import { parseJavaScript } from "./oxc-parser.js";
import { convertAstToQueryOperationWithParams } from "../converter/ast-converter.js";
import type { Queryable, OrderedQueryable } from "../linq/queryable.js";
import type { TerminalQuery } from "../linq/terminal-query.js";
import type { AutoParamInfo } from "../converter/converter-utils.js";

/**
 * Result of parsing a query, including auto-extracted parameters
 */
export interface ParseResult {
  operation: QueryOperation;
  autoParams: Record<string, string | number | boolean | null>;
  autoParamInfos?: Record<string, AutoParamInfo>; // Enhanced field context information
}

/**
 * Parses a query builder function into a QueryOperation tree with auto-extracted parameters
 * @param queryBuilder The function that builds the query
 * @returns The parsed result containing operation tree and auto-params
 * @throws Error if parsing fails
 */
export function parseQuery<TParams, TResult>(
  queryBuilder: (
    params: TParams,
  ) => Queryable<TResult> | OrderedQueryable<TResult> | TerminalQuery<TResult>,
): ParseResult {
  // 1. Convert function to string
  const fnString = queryBuilder.toString();

  // 2. Parse with OXC to get AST
  const ast = parseJavaScript(fnString);
  if (!ast) {
    throw new Error("Failed to parse JavaScript: Invalid syntax in query builder function");
  }

  // 3. Convert AST to QueryOperation tree with auto-params
  const result = convertAstToQueryOperationWithParams(ast);

  if (!result) {
    throw new Error("Failed to convert query: Unable to process query operations");
  }

  return result;
}
