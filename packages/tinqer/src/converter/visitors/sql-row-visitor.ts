/**
 * Row visitor that produces SQL-friendly expression types
 */

import type {
  ColumnExpression,
  ParamExpression,
  ConstantExpression,
  ComparisonExpression,
  LogicalExpression,
  ArithmeticExpression,
  ConcatExpression,
  MethodExpression,
  ObjectExpression,
  ArrayExpression,
  CoalesceExpression,
  InExpression,
  BetweenExpression,
  CaseExpression,
  ValueExpression,
  BooleanExpression,
  SqlExpression,
} from "../../expressions/sql-expression.js";
import type { ParameterRegistry } from "../parameter-registry.js";
import { addParameter } from "../parameter-registry.js";
import type { ASTNode } from "../../parser/ast-types.js";

export interface SqlRowVisitorContext {
  registry: ParameterRegistry;
  lambdaParams: Set<string>;
  tableRef: string;
}

export type SqlRowVisitorResult = [SqlExpression, ParameterRegistry];

/**
 * Visit an identifier
 */
export function visitIdentifier(
  node: ASTNode & { name: string },
  context: SqlRowVisitorContext,
): SqlRowVisitorResult {
  // Check if it's a lambda parameter (represents the table row)
  if (context.lambdaParams.has(node.name)) {
    // Return a placeholder - this will be handled by member access
    const param: ParamExpression = {
      type: "param",
      name: node.name,
    };
    return [param, context.registry];
  }

  // Otherwise it's an external parameter
  const param: ParamExpression = {
    type: "param",
    name: node.name,
  };
  return [param, context.registry];
}

/**
 * Visit a member expression (e.g., x.age)
 */
export function visitMemberExpression(
  node: ASTNode & { object: ASTNode; property: ASTNode; computed: boolean },
  context: SqlRowVisitorContext,
): SqlRowVisitorResult {
  // Check if the object is a lambda parameter
  if (node.object.type === "Identifier" && context.lambdaParams.has((node.object as any).name)) {
    // This is a column reference (e.g., x.age where x is lambda param)
    const propertyName = node.computed
      ? evaluateStaticExpression(node.property)
      : (node.property as any).name;

    const column: ColumnExpression = {
      type: "column",
      name: String(propertyName),
    };
    return [column, context.registry];
  }

  // Otherwise, treat as nested property access on an external parameter
  const [object, registry] = visitNode(node.object, context);

  // For now, convert to method expression (could be improved)
  const method: MethodExpression = {
    type: "method",
    object: object as ValueExpression,
    method: "get",
    arguments: [{ type: "constant", value: (node.property as any).name }],
  };

  return [method, registry];
}

/**
 * Visit a binary expression
 */
export function visitBinaryExpression(
  node: ASTNode & { operator: string; left: ASTNode; right: ASTNode },
  context: SqlRowVisitorContext,
): SqlRowVisitorResult {
  // Handle comparison operators
  const comparisonOps: Record<string, ComparisonExpression["operator"]> = {
    "==": "=",
    "===": "=",
    "!=": "!=",
    "!==": "!=",
    "<": "<",
    "<=": "<=",
    ">": ">",
    ">=": ">=",
  };

  if (node.operator in comparisonOps) {
    const [left, reg1] = visitNode(node.left, context);

    // Auto-parameterize literals on the right side of comparisons
    let right: SqlExpression;
    let reg2 = reg1;

    if (node.right.type === "Literal" && (node.right as any).value !== null) {
      const [newRegistry, paramName] = addParameter(reg1, (node.right as any).value);
      right = { type: "param", name: paramName };
      reg2 = newRegistry;
    } else {
      const result = visitNode(node.right, { ...context, registry: reg1 });
      right = result[0];
      reg2 = result[1];
    }

    const comparison: ComparisonExpression = {
      type: "comparison",
      operator: comparisonOps[node.operator]!,
      left: left as ValueExpression,
      right: right as ValueExpression,
    };
    return [comparison, reg2];
  }

  // Handle logical operators
  if (node.operator === "&&" || node.operator === "||") {
    const [left, reg1] = visitNode(node.left, context);
    const [right, reg2] = visitNode(node.right, { ...context, registry: reg1 });

    const logical: LogicalExpression = {
      type: "logical",
      operator: node.operator === "&&" ? "AND" : "OR",
      operands: [left as BooleanExpression, right as BooleanExpression],
    };
    return [logical, reg2];
  }

  // Handle nullish coalescing
  if (node.operator === "??") {
    const [left, reg1] = visitNode(node.left, context);
    const [right, reg2] = visitNode(node.right, { ...context, registry: reg1 });

    const coalesce: CoalesceExpression = {
      type: "coalesce",
      expressions: [left as ValueExpression, right as ValueExpression],
    };
    return [coalesce, reg2];
  }

  // Handle IN operator
  if (node.operator === "in") {
    const [value, reg1] = visitNode(node.left, context);
    const [list, reg2] = visitNode(node.right, { ...context, registry: reg1 });

    const inExpr: InExpression = {
      type: "in",
      value: value as ValueExpression,
      list: list as ValueExpression[] | ArrayExpression,
    };
    return [inExpr, reg2];
  }

  // Handle arithmetic operators
  const arithmeticOps: Record<string, ArithmeticExpression["operator"]> = {
    "+": "+",
    "-": "-",
    "*": "*",
    "/": "/",
    "%": "%",
  };

  if (node.operator in arithmeticOps) {
    const [left, reg1] = visitNode(node.left, context);
    const [right, reg2] = visitNode(node.right, { ...context, registry: reg1 });

    const arithmetic: ArithmeticExpression = {
      type: "arithmetic",
      operator: arithmeticOps[node.operator]!,
      left: left as ValueExpression,
      right: right as ValueExpression,
    };
    return [arithmetic, reg2];
  }

  throw new Error(`Unsupported binary operator: ${node.operator}`);
}

/**
 * Visit a unary expression
 */
export function visitUnaryExpression(
  node: ASTNode & { operator: string; argument: ASTNode },
  context: SqlRowVisitorContext,
): SqlRowVisitorResult {
  const [argument, registry] = visitNode(node.argument, context);

  if (node.operator === "!") {
    const logical: LogicalExpression = {
      type: "logical",
      operator: "NOT",
      operands: [argument as BooleanExpression],
    };
    return [logical, registry];
  }

  // For other unary operators, treat as arithmetic with 0 or constant
  if (node.operator === "-") {
    const arithmetic: ArithmeticExpression = {
      type: "arithmetic",
      operator: "-",
      left: { type: "constant", value: 0 },
      right: argument as ValueExpression,
    };
    return [arithmetic, registry];
  }

  throw new Error(`Unsupported unary operator: ${node.operator}`);
}

/**
 * Visit a conditional expression (ternary)
 */
export function visitConditionalExpression(
  node: ASTNode & { test: ASTNode; consequent: ASTNode; alternate: ASTNode },
  context: SqlRowVisitorContext,
): SqlRowVisitorResult {
  const [test, reg1] = visitNode(node.test, context);
  const [consequent, reg2] = visitNode(node.consequent, { ...context, registry: reg1 });
  const [alternate, reg3] = visitNode(node.alternate, { ...context, registry: reg2 });

  const caseExpr: CaseExpression = {
    type: "case",
    when: [
      {
        condition: test as BooleanExpression,
        result: consequent as ValueExpression,
      },
    ],
    else: alternate as ValueExpression,
  };

  return [caseExpr, reg3];
}

/**
 * Visit a call expression
 */
export function visitCallExpression(
  node: ASTNode & { callee: ASTNode; arguments: ASTNode[] },
  context: SqlRowVisitorContext,
): SqlRowVisitorResult {
  // Check if it's a method call on an object
  if (node.callee.type === "MemberExpression") {
    const memberNode = node.callee as any;
    const [object, reg1] = visitNode(memberNode.object, context);

    // Convert arguments
    let currentReg = reg1;
    const args: ValueExpression[] = [];
    for (const arg of node.arguments) {
      const [expr, newReg] = visitNode(arg, { ...context, registry: currentReg });
      args.push(expr as ValueExpression);
      currentReg = newReg;
    }

    const method: MethodExpression = {
      type: "method",
      object: object as ValueExpression,
      method: memberNode.property.name,
      arguments: args,
    };

    return [method, currentReg];
  }

  // For now, throw error for other call types
  throw new Error("Function calls not yet supported");
}

/**
 * Visit an array expression
 */
export function visitArrayExpression(
  node: ASTNode & { elements: (ASTNode | null)[] },
  context: SqlRowVisitorContext,
): SqlRowVisitorResult {
  const elements: ValueExpression[] = [];
  let currentReg = context.registry;

  for (const elem of node.elements) {
    if (elem === null) {
      elements.push({ type: "constant", value: null });
    } else {
      const [expr, newReg] = visitNode(elem, { ...context, registry: currentReg });
      elements.push(expr as ValueExpression);
      currentReg = newReg;
    }
  }

  const array: ArrayExpression = {
    type: "array",
    elements,
  };

  return [array, currentReg];
}

/**
 * Visit an object expression
 */
export function visitObjectExpression(
  node: ASTNode & { properties: Array<{ key: ASTNode; value: ASTNode }> },
  context: SqlRowVisitorContext,
): SqlRowVisitorResult {
  const properties: ObjectExpression["properties"] = [];
  let currentReg = context.registry;

  for (const prop of node.properties) {
    const key = (prop.key as any).name || evaluateStaticExpression(prop.key);
    const [value, newReg] = visitNode(prop.value, { ...context, registry: currentReg });
    properties.push({
      key: String(key),
      value: value as ValueExpression,
    });
    currentReg = newReg;
  }

  const object: ObjectExpression = {
    type: "object",
    properties,
  };

  return [object, currentReg];
}

/**
 * Visit a literal
 */
export function visitLiteral(
  node: ASTNode & { value?: unknown; type: string },
  context: SqlRowVisitorContext,
): SqlRowVisitorResult {
  const constant: ConstantExpression = {
    type: "constant",
    value: node.type === "Literal" ? (node as any).value : node.value,
  };
  return [constant, context.registry];
}

/**
 * Main visitor dispatcher
 */
export function visitNode(node: ASTNode, context: SqlRowVisitorContext): SqlRowVisitorResult {
  switch (node.type) {
    case "Identifier":
      return visitIdentifier(node as any, context);

    case "MemberExpression":
      return visitMemberExpression(node as any, context);

    case "BinaryExpression":
    case "LogicalExpression":
      return visitBinaryExpression(node as any, context);

    case "UnaryExpression":
      return visitUnaryExpression(node as any, context);

    case "ConditionalExpression":
      return visitConditionalExpression(node as any, context);

    case "CallExpression":
      return visitCallExpression(node as any, context);

    case "ArrayExpression":
      return visitArrayExpression(node as any, context);

    case "ObjectExpression":
      return visitObjectExpression(node as any, context);

    case "Literal":
    case "BooleanLiteral":
    case "NullLiteral":
    case "NumericLiteral":
    case "StringLiteral":
      return visitLiteral(node as any, context);

    default:
      throw new Error(`Unsupported node type: ${node.type}`);
  }
}

/**
 * Helper to evaluate static expressions
 */
function evaluateStaticExpression(node: ASTNode): unknown {
  if (node.type === "Literal") {
    return (node as any).value;
  }
  if (node.type === "Identifier") {
    return (node as any).name;
  }
  return null;
}
