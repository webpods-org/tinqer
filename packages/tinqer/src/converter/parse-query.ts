/**
 * Simple query parser for lambda expressions
 */

import { parseJavaScript } from "../parser/oxc-parser.js";

/**
 * Parse a lambda string into an AST
 */
export function parseQuery(lambda: string): any {
  const ast = parseJavaScript(lambda);

  if (!ast) {
    throw new Error("Failed to parse lambda expression");
  }

  // The AST should have a body with a single statement (expression statement)
  if (
    (ast as any).body &&
    (ast as any).body.length === 1 &&
    (ast as any).body[0].type === "ExpressionStatement"
  ) {
    return (ast as any).body[0].expression;
  }

  // Or it might be the expression directly
  return ast;
}
