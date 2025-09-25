/**
 * Visitor functions for converting AST nodes to row-level expressions
 */

import type {
  RowExpression,
  RowParameterExpression,
  RowMemberExpression,
  RowBinaryExpression,
  RowUnaryExpression,
  RowConditionalExpression,
  RowCallExpression,
  RowArrayExpression,
  RowObjectExpression,
  ConstantExpression,
  BinaryOperator,
  UnaryOperator,
  RowCoalesceExpression,
  RowInExpression,
  RowCastExpression,
} from "../../expressions/expression.js";
import type { ParameterRegistry } from "../parameter-registry.js";
import { addParameter } from "../parameter-registry.js";

export interface RowVisitorContext {
  registry: ParameterRegistry;
  lambdaParams: Set<string>;
  tableRef: string;
  inSelectProjection?: boolean;
  hasTableParam?: boolean;
  allowOnlyPureExpressions?: boolean;
}

export type RowVisitorResult = [RowExpression, ParameterRegistry];

/**
 * Visit an identifier node
 */
export function visitIdentifier(node: any, context: RowVisitorContext): RowVisitorResult {
  const name = node.name;

  // Check if it's a lambda parameter
  if (context.lambdaParams.has(name)) {
    const param: RowParameterExpression = {
      type: "row-parameter",
      name,
      origin: { type: "table", ref: context.tableRef },
    };
    return [param, context.registry];
  }

  // Check for special identifiers
  if (name === "undefined") {
    const constant: ConstantExpression = {
      type: "constant",
      value: undefined,
    };
    return [constant, context.registry];
  }

  throw new Error(`Unknown identifier: ${name}`);
}

/**
 * Visit a member expression (e.g., user.name)
 */
export function visitMemberExpression(node: any, context: RowVisitorContext): RowVisitorResult {
  const [object, registry] = visitNode(node.object, { ...context, registry: context.registry });

  const property = node.computed
    ? node.property.type === "StringLiteral"
      ? node.property.value
      : (() => {
          throw new Error("Computed properties must be string literals");
        })()
    : node.property.name;

  const member: RowMemberExpression = {
    type: "row-member",
    object,
    property,
    optional: node.optional || false,
  };

  return [member, registry];
}

/**
 * Visit a binary expression
 */
export function visitBinaryExpression(node: any, context: RowVisitorContext): RowVisitorResult {
  // Handle nullish coalescing as special case
  if (node.operator === "??") {
    const [left, reg1] = visitNode(node.left, context);
    const [right, reg2] = visitNode(node.right, { ...context, registry: reg1 });

    const coalesce: RowCoalesceExpression = {
      type: "row-coalesce",
      expressions: [left, right],
    };
    return [coalesce, reg2];
  }

  // Handle IN operator
  if (node.operator === "in") {
    const [value, reg1] = visitNode(node.left, context);
    const [list, reg2] = visitNode(node.right, { ...context, registry: reg1 });

    const inExpr: RowInExpression = {
      type: "row-in",
      value,
      list: list as RowExpression[] | RowArrayExpression,
    };
    return [inExpr, reg2];
  }

  // Check if this is a comparison operator
  const isComparison = ["==", "===", "!=", "!==", "<", "<=", ">", ">="].includes(node.operator);

  // Standard binary operators
  const [left, reg1] = visitNode(node.left, context);

  // For comparisons, if right side is a literal, auto-parameterize it
  let right: RowExpression;
  let reg2 = reg1;

  if (isComparison && node.right.type === "Literal" && node.right.value !== null) {
    // Auto-parameterize the literal
    const [newRegistry, paramName] = addParameter(reg1, node.right.value);
    right = {
      type: "row-parameter",
      name: paramName,
      origin: {
        type: "auto-param",
        ref: paramName,
      },
    } as RowParameterExpression;
    reg2 = newRegistry;
  } else {
    const result = visitNode(node.right, { ...context, registry: reg1 });
    right = result[0];
    reg2 = result[1];
  }

  const binary: RowBinaryExpression = {
    type: "row-binary",
    operator: mapBinaryOperator(node.operator),
    left,
    right,
  };

  return [binary, reg2];
}

/**
 * Visit a unary expression
 */
export function visitUnaryExpression(node: any, context: RowVisitorContext): RowVisitorResult {
  const [argument, registry] = visitNode(node.argument, context);

  const unary: RowUnaryExpression = {
    type: "row-unary",
    operator: node.operator as UnaryOperator,
    argument,
  };

  return [unary, registry];
}

/**
 * Visit a conditional expression (ternary)
 */
export function visitConditionalExpression(
  node: any,
  context: RowVisitorContext,
): RowVisitorResult {
  const [test, reg1] = visitNode(node.test, context);
  const [consequent, reg2] = visitNode(node.consequent, { ...context, registry: reg1 });
  const [alternate, reg3] = visitNode(node.alternate, { ...context, registry: reg2 });

  const conditional: RowConditionalExpression = {
    type: "row-conditional",
    test,
    consequent,
    alternate,
  };

  return [conditional, reg3];
}

/**
 * Visit a call expression
 */
export function visitCallExpression(node: any, context: RowVisitorContext): RowVisitorResult {
  // Check if it's a method call
  if (node.callee.type === "MemberExpression") {
    const methodName = node.callee.property.name;

    // Handle special methods
    if (methodName === "includes" || methodName === "startsWith" || methodName === "endsWith") {
      const [object, reg1] = visitNode(node.callee.object, context);
      const args: RowExpression[] = [];
      let currentReg = reg1;

      for (const arg of node.arguments) {
        const [argExpr, newReg] = visitNode(arg, { ...context, registry: currentReg });
        args.push(argExpr);
        currentReg = newReg;
      }

      const call: RowCallExpression = {
        type: "row-call",
        function: methodName,
        arguments: [object, ...args],
      };

      return [call, currentReg];
    }
  }

  // Handle function calls
  const functionName = node.callee.type === "Identifier" ? node.callee.name : null;
  if (!functionName) {
    throw new Error("Unsupported call expression");
  }

  // Handle cast functions
  if (functionName === "Number" || functionName === "String" || functionName === "Boolean") {
    if (node.arguments.length !== 1) {
      throw new Error(`${functionName} requires exactly one argument`);
    }

    const [expr, reg] = visitNode(node.arguments[0], context);
    const cast: RowCastExpression = {
      type: "row-cast",
      expression: expr,
      targetType: functionName.toLowerCase() as "string" | "number" | "boolean",
    };
    return [cast, reg];
  }

  // Generic function call
  const args: RowExpression[] = [];
  let currentReg = context.registry;

  for (const arg of node.arguments) {
    const [argExpr, newReg] = visitNode(arg, { ...context, registry: currentReg });
    args.push(argExpr);
    currentReg = newReg;
  }

  const call: RowCallExpression = {
    type: "row-call",
    function: functionName,
    arguments: args,
  };

  return [call, currentReg];
}

/**
 * Visit an array expression
 */
export function visitArrayExpression(node: any, context: RowVisitorContext): RowVisitorResult {
  const elements: RowExpression[] = [];
  let currentReg = context.registry;

  for (const elem of node.elements) {
    if (elem === null) {
      // Hole in array
      const constant: ConstantExpression = { type: "constant", value: undefined };
      elements.push(constant);
    } else if (elem.type === "SpreadElement") {
      throw new Error("Spread elements not supported in arrays");
    } else {
      const [expr, newReg] = visitNode(elem, { ...context, registry: currentReg });
      elements.push(expr);
      currentReg = newReg;
    }
  }

  const array: RowArrayExpression = {
    type: "row-array",
    elements,
  };

  return [array, currentReg];
}

/**
 * Visit an object expression
 */
export function visitObjectExpression(node: any, context: RowVisitorContext): RowVisitorResult {
  const properties: Array<{ key: string; value: RowExpression }> = [];
  let currentReg = context.registry;

  for (const prop of node.properties) {
    if (prop.type === "SpreadElement") {
      throw new Error("Spread properties not supported in objects");
    }

    const key =
      prop.key.type === "Identifier"
        ? prop.key.name
        : prop.key.type === "StringLiteral"
          ? prop.key.value
          : (() => {
              throw new Error("Object keys must be identifiers or string literals");
            })();

    const [value, newReg] = visitNode(prop.value, { ...context, registry: currentReg });
    properties.push({ key, value });
    currentReg = newReg;
  }

  const object: RowObjectExpression = {
    type: "row-object",
    properties,
  };

  return [object, currentReg];
}

/**
 * Visit a literal node
 */
export function visitLiteral(node: any, context: RowVisitorContext): RowVisitorResult {
  let value: unknown;

  if (node.type === "Literal") {
    // OXC parser uses Literal for all primitive values
    value = node.value;
  } else if (node.type === "BooleanLiteral") {
    value = node.value;
  } else if (node.type === "NullLiteral") {
    value = null;
  } else if (node.type === "NumericLiteral") {
    value = node.value;
  } else if (node.type === "StringLiteral") {
    value = node.value;
  } else if (node.type === "BigIntLiteral") {
    value = BigInt(node.value);
  } else {
    throw new Error(`Unsupported literal type: ${node.type}`);
  }

  const constant: ConstantExpression = {
    type: "constant",
    value,
  };

  return [constant, context.registry];
}

/**
 * Main visitor dispatcher
 */
export function visitNode(node: any, context: RowVisitorContext): RowVisitorResult {
  switch (node.type) {
    case "Identifier":
      return visitIdentifier(node, context);

    case "MemberExpression":
      return visitMemberExpression(node, context);

    case "BinaryExpression":
    case "LogicalExpression":
      return visitBinaryExpression(node, context);

    case "UnaryExpression":
      return visitUnaryExpression(node, context);

    case "ConditionalExpression":
      return visitConditionalExpression(node, context);

    case "CallExpression":
      return visitCallExpression(node, context);

    case "ArrayExpression":
      return visitArrayExpression(node, context);

    case "ObjectExpression":
      return visitObjectExpression(node, context);

    case "Literal": // OXC parser uses Literal for all primitives
    case "BooleanLiteral":
    case "NullLiteral":
    case "NumericLiteral":
    case "StringLiteral":
    case "BigIntLiteral":
      return visitLiteral(node, context);

    case "ArrowFunctionExpression":
      // Handle nested lambdas for subqueries
      return visitArrowFunction(node, context);

    default:
      throw new Error(`Unsupported node type: ${node.type}`);
  }
}

/**
 * Visit an arrow function (for subqueries)
 */
function visitArrowFunction(_node: any, _context: RowVisitorContext): RowVisitorResult {
  // This would be used for subqueries - implement when needed
  throw new Error("Nested arrow functions (subqueries) not yet implemented");
}

/**
 * Map operators from AST to our expression types
 */
function mapBinaryOperator(op: string): BinaryOperator {
  const mapping: Record<string, BinaryOperator> = {
    "==": "==",
    "===": "==", // Treat strict equality as regular equality
    "!=": "!=",
    "!==": "!=", // Treat strict inequality as regular inequality
    "<": "<",
    "<=": "<=",
    ">": ">",
    ">=": ">=",
    "+": "+",
    "-": "-",
    "*": "*",
    "/": "/",
    "%": "%",
    "&&": "&&",
    "||": "||",
    "??": "??",
    in: "in",
  };

  const mapped = mapping[op];
  if (!mapped) {
    throw new Error(`Unsupported operator: ${op}`);
  }
  return mapped;
}
