/**
 * SQL-friendly expression types (output of visitors)
 * These map more directly to SQL concepts
 */

/**
 * Column reference
 */
export interface ColumnExpression {
  type: "column";
  name: string;
  tableAlias?: string;
}

/**
 * Parameter reference (from query parameters)
 */
export interface ParamExpression {
  type: "param";
  name: string;
}

/**
 * Constant value
 */
export interface ConstantExpression {
  type: "constant";
  value: unknown;
}

/**
 * Comparison expression (=, !=, <, >, <=, >=)
 */
export interface ComparisonExpression {
  type: "comparison";
  operator: "=" | "!=" | "<" | ">" | "<=" | ">=";
  left: ValueExpression;
  right: ValueExpression;
}

/**
 * Logical expression (AND, OR, NOT)
 */
export interface LogicalExpression {
  type: "logical";
  operator: "AND" | "OR" | "NOT";
  operands: BooleanExpression[];
}

/**
 * Arithmetic expression (+, -, *, /, %)
 */
export interface ArithmeticExpression {
  type: "arithmetic";
  operator: "+" | "-" | "*" | "/" | "%";
  left: ValueExpression;
  right: ValueExpression;
}

/**
 * String concatenation
 */
export interface ConcatExpression {
  type: "concat";
  operands: ValueExpression[];
}

/**
 * Method call on a column (for string/array methods)
 */
export interface MethodExpression {
  type: "method";
  object: ValueExpression;
  method: string;
  arguments: ValueExpression[];
}

/**
 * Object literal (for SELECT projections)
 */
export interface ObjectExpression {
  type: "object";
  properties: Array<{
    key: string;
    value: ValueExpression;
  }>;
}

/**
 * Array literal
 */
export interface ArrayExpression {
  type: "array";
  elements: ValueExpression[];
}

/**
 * COALESCE expression
 */
export interface CoalesceExpression {
  type: "coalesce";
  expressions: ValueExpression[];
}

/**
 * IN expression
 */
export interface InExpression {
  type: "in";
  value: ValueExpression;
  list: ValueExpression[] | ArrayExpression | SubqueryExpression;
}

/**
 * BETWEEN expression
 */
export interface BetweenExpression {
  type: "between";
  value: ValueExpression;
  lower: ValueExpression;
  upper: ValueExpression;
}

/**
 * CASE expression
 */
export interface CaseExpression {
  type: "case";
  condition?: ValueExpression;
  when: Array<{
    condition: BooleanExpression;
    result: ValueExpression;
  }>;
  else?: ValueExpression;
}

/**
 * EXISTS expression
 */
export interface ExistsExpression {
  type: "exists";
  subquery: SubqueryExpression;
}

/**
 * Subquery
 */
export interface SubqueryExpression {
  type: "subquery";
  query: unknown; // Would be QueryOperation
}

/**
 * GROUP BY specific types
 */

/**
 * Reference to the grouping key
 */
export interface GroupKeyExpression {
  type: "groupKey";
  keyIndex?: number; // For multiple grouping keys
}

/**
 * Aggregate function
 */
export interface AggregateExpression {
  type: "aggregate";
  function: "COUNT" | "SUM" | "AVG" | "MIN" | "MAX" | "STRING_AGG" | "ARRAY_AGG";
  expression?: ValueExpression; // Optional for COUNT(*)
  distinct?: boolean;
}

/**
 * Union types
 */
export type ValueExpression =
  | ColumnExpression
  | ParamExpression
  | ConstantExpression
  | ArithmeticExpression
  | ConcatExpression
  | MethodExpression
  | ObjectExpression
  | ArrayExpression
  | CoalesceExpression
  | CaseExpression
  | SubqueryExpression
  | GroupKeyExpression
  | AggregateExpression;

export type BooleanExpression =
  | ComparisonExpression
  | LogicalExpression
  | InExpression
  | BetweenExpression
  | ExistsExpression
  | ColumnExpression // For boolean columns
  | ParamExpression // For boolean parameters
  | ConstantExpression // For boolean constants
  | MethodExpression; // For methods returning boolean

export type SqlExpression = ValueExpression | BooleanExpression;
