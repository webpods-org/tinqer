/**
 * Minimal AST types for OXC parser output
 */

export interface ASTNode {
  type: string;
  [key: string]: unknown;
}

export interface Identifier extends ASTNode {
  type: "Identifier";
  name: string;
}

export interface Literal extends ASTNode {
  type: "Literal";
  value: string | number | boolean | null;
}

export interface MemberExpression extends ASTNode {
  type: "MemberExpression";
  object: ASTNode;
  property: ASTNode;
  computed: boolean;
}

export interface CallExpression extends ASTNode {
  type: "CallExpression";
  callee: ASTNode;
  arguments: ASTNode[];
}

export interface ArrowFunctionExpression extends ASTNode {
  type: "ArrowFunctionExpression";
  params: ASTNode[];
  body: ASTNode;
}

export interface BinaryExpression extends ASTNode {
  type: "BinaryExpression" | "LogicalExpression";
  operator: string;
  left: ASTNode;
  right: ASTNode;
}

export interface UnaryExpression extends ASTNode {
  type: "UnaryExpression";
  operator: string;
  argument: ASTNode;
}

export interface ConditionalExpression extends ASTNode {
  type: "ConditionalExpression";
  test: ASTNode;
  consequent: ASTNode;
  alternate: ASTNode;
}

export interface ArrayExpression extends ASTNode {
  type: "ArrayExpression";
  elements: (ASTNode | null)[];
}

export interface ObjectExpression extends ASTNode {
  type: "ObjectExpression";
  properties: Array<{
    key: ASTNode;
    value: ASTNode;
    type: string;
  }>;
}

export interface BlockStatement extends ASTNode {
  type: "BlockStatement";
  body: ASTNode[];
}

export interface ReturnStatement extends ASTNode {
  type: "ReturnStatement";
  argument: ASTNode;
}

export interface ExpressionStatement extends ASTNode {
  type: "ExpressionStatement";
  expression: ASTNode;
}

export interface Program extends ASTNode {
  type: "Program";
  body: ASTNode[];
}

export interface SpreadElement extends ASTNode {
  type: "SpreadElement";
  argument: ASTNode;
}
