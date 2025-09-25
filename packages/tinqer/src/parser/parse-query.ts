/**
 * Parse query builder functions into QueryOperation trees
 */

import type { QueryOperation } from "../query-tree/operations.js";
import { parseJavaScript } from "./oxc-parser.js";
import type { Queryable, OrderedQueryable } from "../linq/queryable.js";
import type { TerminalQuery } from "../linq/terminal-query.js";
import { convertOperationTree } from "../converter/convert-operation-tree-simple.js";

export interface ParseResult {
  operation: QueryOperation;
  autoParams: Record<string, string | number | boolean | null>;
}

/**
 * Parses a query builder function into a QueryOperation tree
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

  // 3. Find the method chain in the AST
  const operation = parseMethodChain(ast);

  if (!operation) {
    console.error("AST:", JSON.stringify(ast, null, 2));
    throw new Error("Failed to parse query: No valid query operations found");
  }

  // 4. Convert the operation tree to include expressions
  const converted = convertOperationTree(operation);

  return {
    operation: converted.operation,
    autoParams: converted.autoParams,
  };
}

/**
 * Parse a method chain from AST
 */
interface ASTProgram {
  body?: Array<{
    type: string;
    expression?: {
      type: string;
      body?:
        | {
            type: string;
            body?: Array<{ type: string; argument?: unknown }>;
          }
        | unknown;
      [key: string]: unknown;
    };
  }>;
}

function parseMethodChain(ast: ASTProgram): QueryOperation | null {
  // The AST structure is: Program > body[0] (ExpressionStatement) > expression
  if (!ast.body || ast.body.length === 0) {
    return null;
  }

  const firstStatement = ast.body[0];

  // Handle arrow function
  if (firstStatement.type === "ExpressionStatement" && firstStatement.expression) {
    const expr = firstStatement.expression;

    // Look for arrow function
    if (expr.type === "ArrowFunctionExpression" && expr.body) {
      // The body should be a call expression (method chain)
      const body = expr.body;

      if (typeof body === "object" && body !== null && "type" in body) {
        if (body.type === "BlockStatement" && "body" in body && Array.isArray(body.body)) {
          // Look for return statement
          const returnStmt = body.body.find((s) => s.type === "ReturnStatement");
          if (returnStmt && "argument" in returnStmt) {
            return parseCallExpression(returnStmt.argument);
          }
        } else {
          // Expression body
          return parseCallExpression(body);
        }
      }
    } else {
      return parseCallExpression(expr);
    }
  }

  return null;
}

/**
 * Parse a call expression to build QueryOperation
 */
interface CallExpressionNode {
  type: string;
  callee?: {
    type: string;
    property?: { name: string };
    object?: unknown;
    name?: string;
  };
  arguments?: Array<{
    type: string;
    value?: unknown;
    params?: unknown[];
    body?: unknown;
    [key: string]: unknown;
  }>;
}

function parseCallExpression(node: unknown): QueryOperation | null {
  // Type guard
  if (!node || typeof node !== "object" || !("type" in node)) {
    return null;
  }

  const astNode = node as CallExpressionNode;
  if (astNode.type !== "CallExpression" || !astNode.callee) {
    return null;
  }

  // Get the method name
  let methodName: string;
  let source: QueryOperation | null = null;

  if (astNode.callee.type === "MemberExpression") {
    // This is a chained method call like: something.where()
    if (!astNode.callee.property?.name) return null;
    methodName = astNode.callee.property.name;

    // Parse the object being called (could be another call or 'from')
    if (
      astNode.callee.object &&
      typeof astNode.callee.object === "object" &&
      "type" in astNode.callee.object &&
      astNode.callee.object.type === "CallExpression"
    ) {
      source = parseCallExpression(astNode.callee.object);
    }
  } else if (astNode.callee.type === "Identifier" && astNode.callee.name) {
    // This is a direct function call like: from()
    methodName = astNode.callee.name;
  } else {
    return null;
  }

  // Build the appropriate operation based on method name
  const args = astNode.arguments || [];

  switch (methodName) {
    case "from": {
      // from(db, "tableName")
      if (args.length >= 2) {
        const tableArg = args[1];
        if (tableArg.type === "Literal" && typeof tableArg.value === "string") {
          return {
            type: "from",
            operationType: "from", // Keep for compatibility
            table: tableArg.value,
          };
        }
      }
      return null;
    }

    case "where": {
      if (!source) return null;

      // Extract the lambda as a string
      const lambda = extractLambdaString(args[0]);
      if (!lambda) return null;

      return {
        type: "where",
        operationType: "where", // Keep for compatibility
        source,
        predicate: lambda,
      };
    }

    case "select": {
      if (!source) return null;

      // Extract the lambda as a string
      const lambda = extractLambdaString(args[0]);
      if (!lambda) return null;

      return {
        type: "select",
        operationType: "select", // Keep for compatibility
        source,
        selector: lambda, // Use 'selector' to match old format
      };
    }

    case "groupBy": {
      if (!source) return null;

      // Extract the key selector lambda
      const keySelector = extractLambdaString(args[0]);
      if (!keySelector) return null;

      // Check for element selector (second argument)
      let elementSelector: string | undefined;
      if (args.length > 1) {
        const selector = extractLambdaString(args[1]);
        if (selector) {
          elementSelector = selector;
        }
      }

      return {
        type: "groupBy",
        operationType: "groupBy", // Keep for compatibility
        source,
        keySelector,
        elementSelector,
      };
    }

    case "orderBy": {
      if (!source) return null;

      const lambda = extractLambdaString(args[0]);
      if (!lambda) return null;

      return {
        type: "orderBy",
        operationType: "orderBy", // Keep for compatibility
        source,
        keySelector: lambda,
      };
    }

    case "orderByDescending": {
      if (!source) return null;

      const lambda = extractLambdaString(args[0]);
      if (!lambda) return null;

      return {
        type: "orderByDescending",
        operationType: "orderByDescending", // Keep for compatibility
        source,
        keySelector: lambda,
      };
    }

    case "thenBy": {
      if (!source) return null;

      const lambda = extractLambdaString(args[0]);
      if (!lambda) return null;

      return {
        type: "thenBy",
        operationType: "thenBy", // Keep for compatibility
        source,
        keySelector: lambda,
      };
    }

    case "thenByDescending": {
      if (!source) return null;

      const lambda = extractLambdaString(args[0]);
      if (!lambda) return null;

      return {
        type: "thenByDescending",
        operationType: "thenByDescending", // Keep for compatibility
        source,
        keySelector: lambda,
      };
    }

    case "join": {
      if (!source) return null;

      // join(inner, outerKeySelector, innerKeySelector, resultSelector)
      if (args.length < 3) return null;

      // Parse inner source
      const innerSource = parseCallExpression(args[0]);
      if (!innerSource) return null;

      const outerKey = extractLambdaString(args[1]);
      const innerKey = extractLambdaString(args[2]);

      if (!outerKey || !innerKey) return null;

      let resultSelector: string | undefined;
      if (args.length > 3) {
        const selector = extractLambdaString(args[3]);
        if (selector) {
          resultSelector = selector;
        }
      }

      return {
        type: "join",
        operationType: "join", // Keep for compatibility
        outer: source,
        inner: innerSource,
        outerKeySelector: outerKey,
        innerKeySelector: innerKey,
        resultSelector,
      };
    }

    case "distinct": {
      if (!source) return null;

      return {
        type: "distinct",
        operationType: "distinct", // Keep for compatibility
        source,
      };
    }

    case "take": {
      if (!source) return null;

      // Get the count
      const countArg = args[0];
      if (!countArg) return null;

      let count: number;
      if (countArg.type === "Literal" && typeof countArg.value === "number") {
        count = countArg.value;
      } else {
        // For now, default to 1 if not a literal
        count = 1;
      }

      return {
        type: "take",
        operationType: "take", // Keep for compatibility
        source,
        count,
      };
    }

    case "skip": {
      if (!source) return null;

      // Get the count
      const countArg = args[0];
      if (!countArg) return null;

      let count: number;
      if (countArg.type === "Literal" && typeof countArg.value === "number") {
        count = countArg.value;
      } else {
        // For now, default to 0 if not a literal
        count = 0;
      }

      return {
        type: "skip",
        operationType: "skip", // Keep for compatibility
        source,
        count,
      };
    }

    // Terminal operations
    case "first":
    case "firstOrDefault":
    case "single":
    case "singleOrDefault":
    case "last":
    case "lastOrDefault":
    case "count":
    case "any":
    case "all":
    case "toArray": {
      if (!source) return null;

      // These are terminal operations but we treat them as regular operations
      // for the purpose of building the tree
      // The actual implementation would need to handle these specially
      return source;
    }

    default:
      // Unknown method, just return the source
      return source;
  }
}

interface LambdaNode {
  type: string;
  params?: Array<{ type: string; name?: string }>;
  body?: unknown;
}

/**
 * Extract a lambda expression as a string
 */
function extractLambdaString(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;

  const lambdaNode = node as LambdaNode;
  if (lambdaNode.type === "ArrowFunctionExpression" && lambdaNode.params && lambdaNode.body) {
    // Get parameter names
    const params = lambdaNode.params
      .map((p) => {
        if (p.type === "Identifier" && p.name) {
          return p.name;
        }
        return "_";
      })
      .join(", ");

    // Convert body to string
    // For now, we'll reconstruct it from the AST
    const bodyStr = reconstructExpression(lambdaNode.body);

    return `(${params}) => ${bodyStr}`;
  }

  return null;
}

interface ExpressionNode {
  type: string;
  name?: string;
  value?: unknown;
  object?: unknown;
  property?: unknown & { name?: string };
  computed?: boolean;
  left?: unknown;
  right?: unknown;
  operator?: string;
  argument?: unknown;
  test?: unknown;
  consequent?: unknown;
  alternate?: unknown;
  callee?: unknown;
  arguments?: unknown[];
  properties?: Array<{
    key: { type: string; name?: string };
    value: unknown;
  }>;
  elements?: unknown[];
  body?: Array<{ type: string; argument?: unknown }>;
}

/**
 * Reconstruct an expression from AST node
 * This is a simplified version that handles common cases
 */
function reconstructExpression(node: unknown): string {
  if (!node || typeof node !== "object") return "";

  const exprNode = node as ExpressionNode;

  switch (exprNode.type) {
    case "Identifier":
      return exprNode.name || "";

    case "MemberExpression": {
      const obj = reconstructExpression(exprNode.object);
      if (exprNode.computed) {
        const prop = reconstructExpression(exprNode.property);
        return `${obj}[${prop}]`;
      } else {
        const propName = (exprNode.property as { name?: string })?.name || "";
        return `${obj}.${propName}`;
      }
    }

    case "BinaryExpression":
    case "LogicalExpression": {
      const left = reconstructExpression(exprNode.left);
      const right = reconstructExpression(exprNode.right);
      return `${left} ${exprNode.operator || ""} ${right}`;
    }

    case "UnaryExpression":
      return `${exprNode.operator || ""}${reconstructExpression(exprNode.argument)}`;

    case "ConditionalExpression": {
      const test = reconstructExpression(exprNode.test);
      const consequent = reconstructExpression(exprNode.consequent);
      const alternate = reconstructExpression(exprNode.alternate);
      return `${test} ? ${consequent} : ${alternate}`;
    }

    case "CallExpression": {
      const callee = reconstructExpression(exprNode.callee);
      const args = (exprNode.arguments || []).map(reconstructExpression).join(", ");
      return `${callee}(${args})`;
    }

    case "ObjectExpression": {
      const props = (exprNode.properties || [])
        .map((prop) => {
          const key =
            prop.key.type === "Identifier" && prop.key.name
              ? prop.key.name
              : reconstructExpression(prop.key);
          const value = reconstructExpression(prop.value);
          return `${key}: ${value}`;
        })
        .join(", ");
      return `{ ${props} }`;
    }

    case "ArrayExpression": {
      const elements = (exprNode.elements || [])
        .map((el) => (el ? reconstructExpression(el) : ""))
        .join(", ");
      return `[${elements}]`;
    }

    case "Literal":
      // OXC parser uses Literal for all primitive values
      if (typeof exprNode.value === "string") {
        return `"${exprNode.value}"`;
      } else if (typeof exprNode.value === "number") {
        return exprNode.value.toString();
      } else if (typeof exprNode.value === "boolean") {
        return exprNode.value ? "true" : "false";
      } else if (exprNode.value === null) {
        return "null";
      }
      return String(exprNode.value);

    case "BlockStatement":
      // For block statements in arrow functions, try to find return
      if (Array.isArray(exprNode.body)) {
        const returnStmt = exprNode.body.find((s) => s.type === "ReturnStatement");
        if (returnStmt && "argument" in returnStmt) {
          return reconstructExpression(returnStmt.argument);
        }
      }
      return "";

    default:
      // For unsupported types, return a placeholder
      return `[${exprNode.type}]`;
  }
}
