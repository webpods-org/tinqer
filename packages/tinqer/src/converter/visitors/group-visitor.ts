/**
 * Visitor functions for converting AST nodes to group-level expressions
 */

import type {
  GroupExpression,
  GroupParameterExpression,
  GroupMemberExpression,
  GroupBinaryExpression,
  GroupUnaryExpression,
  GroupConditionalExpression,
  GroupCallExpression,
  GroupArrayExpression,
  GroupObjectExpression,
  GroupKeyExpression,
  AggregateExpression,
  ConstantExpression,
  BinaryOperator,
  UnaryOperator,
  GroupCoalesceExpression,
  GroupInExpression,
  GroupCastExpression,
  RowExpression,
} from "../../expressions/expression.js";
import type { ParameterRegistry } from "../parameter-registry.js";
import { visitNode as visitRowNode, type RowVisitorContext } from "./row-visitor.js";

export interface GroupVisitorContext {
  registry: ParameterRegistry;
  lambdaParams: Set<string>;
  tableRef: string;
  groupKeys: Map<string, RowExpression>; // Maps group parameter to its key expression
  inSelectProjection?: boolean;
  hasTableParam?: boolean;
  allowOnlyPureExpressions?: boolean;
}

export type GroupVisitorResult = [GroupExpression, ParameterRegistry];

/**
 * Visit an identifier node in group context
 */
export function visitIdentifier(
  node: any,
  context: GroupVisitorContext
): GroupVisitorResult {
  const name = node.name;

  // Check if it's a lambda parameter (now represents a group)
  if (context.lambdaParams.has(name)) {
    const param: GroupParameterExpression = {
      type: "group-parameter",
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
 * Visit a member expression in group context
 */
export function visitMemberExpression(
  node: any,
  context: GroupVisitorContext
): GroupVisitorResult {
  // Check if this is accessing a group key
  if (node.object.type === "Identifier" && context.lambdaParams.has(node.object.name)) {
    const property = node.computed
      ? node.property.type === "StringLiteral"
        ? node.property.value
        : (() => { throw new Error("Computed properties must be string literals"); })()
      : node.property.name;

    // Special case: accessing .Key on a group parameter
    if (property === "Key") {
      const groupKey = context.groupKeys.get(node.object.name);
      if (!groupKey) {
        throw new Error(`No group key found for parameter ${node.object.name}`);
      }

      const keyExpr: GroupKeyExpression = {
        type: "group-key",
        keyExpression: groupKey,
        origin: { type: "table", ref: context.tableRef },
      };
      return [keyExpr, context.registry];
    }

    // Otherwise it's accessing a property of the group parameter
    const param: GroupParameterExpression = {
      type: "group-parameter",
      name: node.object.name,
      origin: { type: "table", ref: context.tableRef },
    };

    const member: GroupMemberExpression = {
      type: "group-member",
      object: param,
      property,
      optional: node.optional || false,
    };

    return [member, context.registry];
  }

  // General member expression
  const [object, registry] = visitNode(node.object, { ...context, registry: context.registry });

  const property = node.computed
    ? node.property.type === "StringLiteral"
      ? node.property.value
      : (() => { throw new Error("Computed properties must be string literals"); })()
    : node.property.name;

  const member: GroupMemberExpression = {
    type: "group-member",
    object,
    property,
    optional: node.optional || false,
  };

  return [member, registry];
}

/**
 * Visit a call expression in group context
 */
export function visitCallExpression(
  node: any,
  context: GroupVisitorContext
): GroupVisitorResult {
  // Check if it's a method call on a group
  if (node.callee.type === "MemberExpression") {
    const methodName = node.callee.property.name;

    // Check for aggregate functions
    if (isAggregateFunction(methodName)) {
      return visitAggregateFunction(node, methodName, context);
    }

    // Handle regular methods
    if (methodName === "includes" || methodName === "startsWith" || methodName === "endsWith") {
      const [object, reg1] = visitNode(node.callee.object, context);
      const args: GroupExpression[] = [];
      let currentReg = reg1;

      for (const arg of node.arguments) {
        const [argExpr, newReg] = visitNode(arg, { ...context, registry: currentReg });
        args.push(argExpr);
        currentReg = newReg;
      }

      const call: GroupCallExpression = {
        type: "group-call",
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
    const cast: GroupCastExpression = {
      type: "group-cast",
      expression: expr,
      targetType: functionName.toLowerCase() as "string" | "number" | "boolean",
    };
    return [cast, reg];
  }

  // Generic function call
  const args: GroupExpression[] = [];
  let currentReg = context.registry;

  for (const arg of node.arguments) {
    const [argExpr, newReg] = visitNode(arg, { ...context, registry: currentReg });
    args.push(argExpr);
    currentReg = newReg;
  }

  const call: GroupCallExpression = {
    type: "group-call",
    function: functionName,
    arguments: args,
  };

  return [call, currentReg];
}

/**
 * Visit an aggregate function call
 */
function visitAggregateFunction(
  node: any,
  functionName: string,
  context: GroupVisitorContext
): GroupVisitorResult {
  const aggregateFn = functionName.toLowerCase() as AggregateExpression["function"];

  // For COUNT, check if it's COUNT(*)
  if (aggregateFn === "count" && node.arguments.length === 0) {
    const aggregate: AggregateExpression = {
      type: "aggregate",
      function: "count",
      expression: null,
      origin: { type: "table", ref: context.tableRef },
    };
    return [aggregate, context.registry];
  }

  // For other aggregates, process the argument as a row expression
  if (node.arguments.length !== 1) {
    throw new Error(`${functionName} requires exactly one argument`);
  }

  // Convert the argument in row context (it operates on individual rows within the group)
  const rowContext: RowVisitorContext = {
    registry: context.registry,
    lambdaParams: context.lambdaParams,
    tableRef: context.tableRef,
    inSelectProjection: context.inSelectProjection,
    hasTableParam: context.hasTableParam,
    allowOnlyPureExpressions: context.allowOnlyPureExpressions,
  };

  const [expr, reg] = visitRowNode(node.arguments[0], rowContext);

  const aggregate: AggregateExpression = {
    type: "aggregate",
    function: aggregateFn,
    expression: expr,
    origin: { type: "table", ref: context.tableRef },
  };

  return [aggregate, reg];
}

/**
 * Check if a method name is an aggregate function
 */
function isAggregateFunction(name: string): boolean {
  const aggregates = ["sum", "count", "avg", "min", "max", "array_agg", "string_agg"];
  return aggregates.includes(name.toLowerCase());
}

/**
 * Visit a binary expression in group context
 */
export function visitBinaryExpression(
  node: any,
  context: GroupVisitorContext
): GroupVisitorResult {
  // Handle nullish coalescing
  if (node.operator === "??") {
    const [left, reg1] = visitNode(node.left, context);
    const [right, reg2] = visitNode(node.right, { ...context, registry: reg1 });

    const coalesce: GroupCoalesceExpression = {
      type: "group-coalesce",
      expressions: [left, right],
    };
    return [coalesce, reg2];
  }

  // Handle IN operator
  if (node.operator === "in") {
    const [value, reg1] = visitNode(node.left, context);
    const [list, reg2] = visitNode(node.right, { ...context, registry: reg1 });

    const inExpr: GroupInExpression = {
      type: "group-in",
      value,
      list: list as GroupExpression[] | GroupArrayExpression,
    };
    return [inExpr, reg2];
  }

  // Standard binary operators
  const [left, reg1] = visitNode(node.left, context);
  const [right, reg2] = visitNode(node.right, { ...context, registry: reg1 });

  const binary: GroupBinaryExpression = {
    type: "group-binary",
    operator: mapBinaryOperator(node.operator),
    left,
    right,
  };

  return [binary, reg2];
}

/**
 * Visit a unary expression in group context
 */
export function visitUnaryExpression(
  node: any,
  context: GroupVisitorContext
): GroupVisitorResult {
  const [argument, registry] = visitNode(node.argument, context);

  const unary: GroupUnaryExpression = {
    type: "group-unary",
    operator: node.operator as UnaryOperator,
    argument,
  };

  return [unary, registry];
}

/**
 * Visit a conditional expression in group context
 */
export function visitConditionalExpression(
  node: any,
  context: GroupVisitorContext
): GroupVisitorResult {
  const [test, reg1] = visitNode(node.test, context);
  const [consequent, reg2] = visitNode(node.consequent, { ...context, registry: reg1 });
  const [alternate, reg3] = visitNode(node.alternate, { ...context, registry: reg2 });

  const conditional: GroupConditionalExpression = {
    type: "group-conditional",
    test,
    consequent,
    alternate,
  };

  return [conditional, reg3];
}

/**
 * Visit an array expression in group context
 */
export function visitArrayExpression(
  node: any,
  context: GroupVisitorContext
): GroupVisitorResult {
  const elements: GroupExpression[] = [];
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

  const array: GroupArrayExpression = {
    type: "group-array",
    elements,
  };

  return [array, currentReg];
}

/**
 * Visit an object expression in group context
 */
export function visitObjectExpression(
  node: any,
  context: GroupVisitorContext
): GroupVisitorResult {
  const properties: Array<{ key: string; value: GroupExpression }> = [];
  let currentReg = context.registry;

  for (const prop of node.properties) {
    if (prop.type === "SpreadElement") {
      throw new Error("Spread properties not supported in objects");
    }

    const key = prop.key.type === "Identifier"
      ? prop.key.name
      : prop.key.type === "StringLiteral"
      ? prop.key.value
      : (() => { throw new Error("Object keys must be identifiers or string literals"); })();

    const [value, newReg] = visitNode(prop.value, { ...context, registry: currentReg });
    properties.push({ key, value });
    currentReg = newReg;
  }

  const object: GroupObjectExpression = {
    type: "group-object",
    properties,
  };

  return [object, currentReg];
}

/**
 * Visit a literal node in group context
 */
export function visitLiteral(
  node: any,
  context: GroupVisitorContext
): GroupVisitorResult {
  let value: unknown;

  if (node.type === "BooleanLiteral") {
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
 * Main visitor dispatcher for group context
 */
export function visitNode(
  node: any,
  context: GroupVisitorContext
): GroupVisitorResult {
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
 * Visit an arrow function in group context (for subqueries)
 */
function visitArrowFunction(
  _node: any,
  _context: GroupVisitorContext
): GroupVisitorResult {
  // This would be used for subqueries - implement when needed
  throw new Error("Nested arrow functions (subqueries) not yet implemented");
}

/**
 * Map operators from AST to our expression types
 */
function mapBinaryOperator(op: string): BinaryOperator {
  const mapping: Record<string, BinaryOperator> = {
    "==": "==",
    "===": "==",
    "!=": "!=",
    "!==": "!=",
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
    "in": "in",
  };

  const mapped = mapping[op];
  if (!mapped) {
    throw new Error(`Unsupported operator: ${op}`);
  }
  return mapped;
}