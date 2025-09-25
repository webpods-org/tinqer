/**
 * Expression conversion functions
 * Converts AST expressions to our Expression types
 */

import type {
  Expression,
  BooleanExpression,
  ValueExpression,
  ObjectExpression,
  ColumnExpression,
  ConstantExpression,
  ParameterExpression,
  ComparisonExpression,
  LogicalExpression,
  ArithmeticExpression,
  BooleanMethodExpression,
  ConcatExpression,
  StringMethodExpression,
  AggregateExpression,
  ConditionalExpression,
  CoalesceExpression,
  InExpression,
  ArrayExpression,
} from "../expressions/expression.js";

import type {
  ASTNode,
  Expression as ASTExpression,
  Identifier,
  MemberExpression as ASTMemberExpression,
  CallExpression as ASTCallExpression,
  ArrowFunctionExpression,
  BinaryExpression as ASTBinaryExpression,
  LogicalExpression as ASTLogicalExpression,
  UnaryExpression as ASTUnaryExpression,
  ObjectExpression as ASTObjectExpression,
  ConditionalExpression as ASTConditionalExpression,
  ChainExpression as ASTChainExpression,
  ArrayExpression as ASTArrayExpression,
  Literal,
  NumericLiteral,
  StringLiteral,
  BooleanLiteral,
  NullLiteral,
  ParenthesizedExpression,
} from "../parser/ast-types.js";

import type { ConversionContext } from "./converter-utils.js";
import type {
  ColumnShapeNode,
  ObjectShapeNode,
  ReferenceShapeNode,
} from "../query-tree/operations.js";
import {
  getParameterName,
  getReturnExpression,
  isBooleanExpression,
  isValueExpression,
  isLikelyStringColumn,
  isLikelyStringParam,
  createAutoParam,
} from "./converter-utils.js";

/**
 * Converts an OXC AST to an Expression
 * This handles individual expressions within lambdas
 */
export function convertAstToExpression(
  ast: ASTExpression,
  context: ConversionContext,
): Expression | null {
  if (!ast) return null;

  switch (ast.type) {
    case "Identifier":
      return convertIdentifier(ast, context);

    case "MemberExpression":
      return convertMemberExpression(ast, context);

    case "BinaryExpression":
      return convertBinaryExpression(ast, context);

    case "LogicalExpression":
      return convertLogicalExpression(ast, context);

    case "Literal":
    case "NumericLiteral":
    case "StringLiteral":
    case "BooleanLiteral":
    case "NullLiteral":
      return convertLiteral(
        ast as Literal | NumericLiteral | StringLiteral | BooleanLiteral | NullLiteral,
        context,
      );

    case "CallExpression":
      return convertCallExpression(ast, context);

    case "ObjectExpression":
      return convertObjectExpression(ast, context);

    case "ArrowFunctionExpression":
      return convertLambdaExpression(ast, context);

    case "ArrayExpression":
      return convertArrayExpression(ast, context);

    case "UnaryExpression": {
      const unaryExpr = ast as ASTUnaryExpression;

      // Handle logical NOT
      if (unaryExpr.operator === "!") {
        const expr = convertAstToExpression(unaryExpr.argument, context);

        // Convert column to booleanColumn if needed
        let finalExpr = expr;
        if (expr && expr.type === "column") {
          finalExpr = {
            type: "booleanColumn",
            name: (expr as ColumnExpression).name,
          };
        }

        if (finalExpr && isBooleanExpression(finalExpr)) {
          return {
            type: "not",
            expression: finalExpr as BooleanExpression,
          };
        }
      }

      // Handle unary minus (negative numbers)
      if (unaryExpr.operator === "-") {
        // Check if the argument is a numeric literal
        if (unaryExpr.argument.type === "NumericLiteral") {
          const value = -(unaryExpr.argument as NumericLiteral).value;
          // Auto-parameterize the negative number
          const paramName = createAutoParam(context, value);
          return {
            type: "param",
            param: paramName,
          } as ParameterExpression;
        }

        // Check if it's a regular Literal with numeric value
        if (unaryExpr.argument.type === "Literal") {
          const literalValue = (unaryExpr.argument as Literal).value;
          if (typeof literalValue === "number") {
            const value = -literalValue;
            // Auto-parameterize the negative number
            const paramName = createAutoParam(context, value);
            return {
              type: "param",
              param: paramName,
            } as ParameterExpression;
          }
        }

        // For other expressions (e.g., -params.value), convert and negate
        const argExpr = convertAstToExpression(unaryExpr.argument, context);
        if (argExpr) {
          // For parameters or columns, create arithmetic expression
          return {
            type: "arithmetic",
            operator: "*",
            left: {
              type: "constant",
              value: -1,
            } as ConstantExpression,
            right: argExpr,
          } as ArithmeticExpression;
        }
      }

      // Handle unary plus (just pass through)
      if (unaryExpr.operator === "+") {
        return convertAstToExpression(unaryExpr.argument, context);
      }

      return null;
    }

    case "ParenthesizedExpression": {
      // Simply unwrap parentheses and process the inner expression
      const parenExpr = ast as ParenthesizedExpression;
      return convertAstToExpression(parenExpr.expression, context);
    }

    case "ConditionalExpression":
      return convertConditionalExpression(ast as ASTConditionalExpression, context);

    case "ChainExpression": {
      // Optional chaining - unwrap and process the inner expression
      const chainExpr = ast as ASTChainExpression;
      return convertAstToExpression(chainExpr.expression, context);
    }

    default:
      throw new Error(`Unsupported AST node type: ${(ast as ASTNode).type}`);
  }
}

export function convertIdentifier(ast: Identifier, context: ConversionContext): Expression | null {
  const name = ast.name;

  // Check if it's a table parameter
  if (context.tableParams.has(name)) {
    // When used in a JOIN result selector context, treat it as a column reference
    // representing the entire row (will be handled specially)
    if (context.joinParams && context.joinParams.has(name)) {
      const tableIndex = context.joinParams.get(name);
      return {
        type: "column",
        name,
        table: `$param${tableIndex}`,
      } as ColumnExpression;
    }
    // Otherwise, this is a direct reference to the table parameter
    // Return a column that represents the entire row
    return {
      type: "column",
      name,
    } as ColumnExpression;
  }

  // Check if it's a query parameter
  if (context.queryParams.has(name)) {
    return {
      type: "param",
      param: name,
    } as ParameterExpression;
  }

  // Unknown identifier - this should not be allowed
  throw new Error(
    `Unknown identifier '${name}'. Variables must be passed via params object or referenced as table parameters.`,
  );
}

export function convertMemberExpression(
  ast: ASTMemberExpression,
  context: ConversionContext,
): Expression | null {
  // Handle array indexing (e.g., params.roles[0])
  if (ast.computed && ast.object.type === "Identifier") {
    const objectName = (ast.object as Identifier).name;

    // Get the index value (could be NumericLiteral or Literal)
    let index: number | null = null;
    if (ast.property.type === "NumericLiteral") {
      index = (ast.property as NumericLiteral).value;
    } else if (
      ast.property.type === "Literal" &&
      typeof (ast.property as Literal).value === "number"
    ) {
      index = (ast.property as Literal).value as number;
    }

    if (index !== null) {
      // Check if it's a query parameter array access
      if (context.queryParams.has(objectName)) {
        return {
          type: "param",
          param: objectName,
          index: index,
        } as ParameterExpression;
      }
    }
  }

  // Also handle nested array indexing (e.g., params.data.roles[0])
  if (ast.computed && ast.object.type === "MemberExpression") {
    const memberObj = convertMemberExpression(ast.object as ASTMemberExpression, context);

    // Get the index value
    let index: number | null = null;
    if (ast.property.type === "NumericLiteral") {
      index = (ast.property as NumericLiteral).value;
    } else if (
      ast.property.type === "Literal" &&
      typeof (ast.property as Literal).value === "number"
    ) {
      index = (ast.property as Literal).value as number;
    }

    if (index !== null && memberObj && memberObj.type === "param") {
      const paramExpr = memberObj as ParameterExpression;
      return {
        type: "param",
        param: paramExpr.param,
        property: paramExpr.property,
        index: index,
      } as ParameterExpression;
    }
  }

  // Handle nested member access (e.g., joined.orderItem.product_id)
  if (
    ast.object.type === "MemberExpression" &&
    ast.property.type === "Identifier" &&
    !ast.computed
  ) {
    const innerMember = convertMemberExpression(ast.object as ASTMemberExpression, context);
    const propertyName = (ast.property as Identifier).name;

    if (innerMember && innerMember.type === "column") {
      const innerCol = innerMember as ColumnExpression;

      // Check if we're accessing through a JOIN result shape
      if (context.currentResultShape && innerCol.table === context.joinResultParam) {
        const shapeProp = context.currentResultShape.properties.get(innerCol.name);
        if (shapeProp) {
          // Check what type of shape node this is
          if (shapeProp.type === "object") {
            // This is a nested object, look for the property within it
            const nestedProp = shapeProp.properties.get(propertyName);
            if (nestedProp && nestedProp.type === "column") {
              // Found a column in the nested object
              return {
                type: "column",
                name: nestedProp.columnName,
                table: `$joinSource${nestedProp.sourceTable}`, // Mark which source table
              } as ColumnExpression;
            }
          } else if (shapeProp.type === "reference") {
            // This references an entire table, so the property is a column from that table
            return {
              type: "column",
              name: propertyName,
              table: `$joinSource${shapeProp.sourceTable}`, // Mark which source table
            } as ColumnExpression;
          }
        }
      }

      // Default nested member access
      return {
        type: "column",
        name: propertyName,
        table: innerCol.name, // Use the inner column name as the table reference
      } as ColumnExpression;
    }
  }

  // Check if both object and property are identifiers
  if (ast.object.type === "Identifier" && ast.property.type === "Identifier" && !ast.computed) {
    const objectName = (ast.object as Identifier).name;
    const propertyName = (ast.property as Identifier).name;

    // Handle JavaScript built-in constants like Number.MAX_SAFE_INTEGER
    if (objectName === "Number") {
      let value: number | undefined;
      if (propertyName === "MAX_SAFE_INTEGER") {
        value = Number.MAX_SAFE_INTEGER;
      } else if (propertyName === "MIN_SAFE_INTEGER") {
        value = Number.MIN_SAFE_INTEGER;
      } else if (propertyName === "MAX_VALUE") {
        value = Number.MAX_VALUE;
      } else if (propertyName === "MIN_VALUE") {
        value = Number.MIN_VALUE;
      } else if (propertyName === "POSITIVE_INFINITY") {
        value = Number.POSITIVE_INFINITY;
      } else if (propertyName === "NEGATIVE_INFINITY") {
        value = Number.NEGATIVE_INFINITY;
      } else if (propertyName === "NaN") {
        value = Number.NaN;
      }

      if (value !== undefined) {
        // Convert to auto-parameterized parameter
        const paramName = createAutoParam(context, value);

        return {
          type: "param",
          param: paramName,
        } as ParameterExpression;
      }
    }

    // Check if this is a reference to the JOIN result parameter
    if (context.joinResultParam === objectName && context.currentResultShape) {
      // This is accessing a property of the JOIN result (e.g., joined.orderItem)
      const shapeProp = context.currentResultShape.properties.get(propertyName);
      if (shapeProp) {
        // This property maps to a specific source table or nested object
        if (shapeProp.type === "reference") {
          // This property is a reference to an entire table
          // Return a column that preserves the nested path for further resolution
          return {
            type: "column",
            name: propertyName,
            table: objectName,
          } as ColumnExpression;
        } else if (shapeProp.type === "object") {
          // This is a nested object, return a column that preserves the path
          return {
            type: "column",
            name: propertyName,
            table: objectName,
          } as ColumnExpression;
        } else if (shapeProp.type === "column") {
          // Direct column reference
          const colNode = shapeProp as ColumnShapeNode;
          return {
            type: "column",
            name: colNode.columnName,
            table: `$joinSource${colNode.sourceTable}`,
          } as ColumnExpression;
        }
      }
    }

    // Check if the object is a table parameter (e.g., x.name where x is table param)
    if (context.tableParams.has(objectName)) {
      // Check if this is a JOIN parameter (has mapping to table index)
      if (context.joinParams && context.joinParams.has(objectName)) {
        // For JOIN parameters, preserve which parameter it refers to
        return {
          type: "column",
          name: propertyName,
          table: `$param${context.joinParams.get(objectName)}`, // Mark as parameter reference
        } as ColumnExpression;
      }
      return {
        type: "column",
        name: propertyName,
      } as ColumnExpression;
    }

    // Check if it's a query parameter (e.g., p.minAge where p is query param)
    if (context.queryParams.has(objectName)) {
      return {
        type: "param",
        param: objectName,
        property: propertyName,
      } as ParameterExpression;
    }
  }

  // Nested member access (e.g., x.address.city)
  const obj = convertAstToExpression(ast.object, context);
  if (obj && obj.type === "column" && ast.property.type === "Identifier") {
    // Flatten nested column access
    const propertyName = (ast.property as Identifier).name;
    return {
      type: "column",
      name: `${(obj as ColumnExpression).name}.${propertyName}`,
    } as ColumnExpression;
  }

  return null;
}

export function convertBinaryExpression(
  ast: ASTBinaryExpression,
  context: ConversionContext,
): Expression | null {
  // Use column hint for comparisons and simple arithmetic (column op literal)
  let columnHint: string | undefined;
  const isComparison = ["==", "===", "!=", "!==", ">", ">=", "<", "<="].includes(ast.operator);

  if (isComparison) {
    // For comparisons, use column hints to relate constants to compared columns
    if (
      ast.left.type === "MemberExpression" &&
      (ast.right.type === "Literal" ||
        ast.right.type === "NumericLiteral" ||
        ast.right.type === "StringLiteral" ||
        ast.right.type === "BooleanLiteral" ||
        ast.right.type === "NullLiteral")
    ) {
      // Pattern: column OP literal
      const memberExpr = ast.left as ASTMemberExpression;
      if (memberExpr.property && memberExpr.property.type === "Identifier") {
        columnHint = (memberExpr.property as Identifier).name;
      }
    } else if (
      ast.right.type === "MemberExpression" &&
      (ast.left.type === "Literal" ||
        ast.left.type === "NumericLiteral" ||
        ast.left.type === "StringLiteral" ||
        ast.left.type === "BooleanLiteral" ||
        ast.left.type === "NullLiteral")
    ) {
      // Pattern: literal OP column
      const memberExpr = ast.right as ASTMemberExpression;
      if (memberExpr.property && memberExpr.property.type === "Identifier") {
        columnHint = (memberExpr.property as Identifier).name;
      }
    }
  } else if (
    ["+", "-", "*", "/", "%"].includes(ast.operator) &&
    ast.left.type === "MemberExpression" &&
    (ast.right.type === "Literal" ||
      ast.right.type === "NumericLiteral" ||
      ast.right.type === "StringLiteral" ||
      ast.right.type === "BooleanLiteral" ||
      ast.right.type === "NullLiteral")
  ) {
    // For arithmetic operations with column on left, use column hints
    // but will be overridden later for string concatenation contexts (for +)
    const memberExpr = ast.left as ASTMemberExpression;
    if (memberExpr.property && memberExpr.property.type === "Identifier") {
      columnHint = (memberExpr.property as Identifier).name;
    }
  }

  // Convert left side
  let left: Expression | null;
  if (
    columnHint &&
    (ast.left.type === "Literal" ||
      ast.left.type === "NumericLiteral" ||
      ast.left.type === "StringLiteral" ||
      ast.left.type === "BooleanLiteral" ||
      ast.left.type === "NullLiteral")
  ) {
    left = convertLiteral(
      ast.left as Literal | NumericLiteral | StringLiteral | BooleanLiteral | NullLiteral,
      context,
      columnHint,
    );
  } else {
    left = convertAstToExpression(ast.left, context);
  }

  // Convert right side with column hint for literals
  let right: Expression | null;
  if (
    columnHint &&
    (ast.right.type === "Literal" ||
      ast.right.type === "NumericLiteral" ||
      ast.right.type === "StringLiteral" ||
      ast.right.type === "BooleanLiteral" ||
      ast.right.type === "NullLiteral")
  ) {
    right = convertLiteral(
      ast.right as Literal | NumericLiteral | StringLiteral | BooleanLiteral | NullLiteral,
      context,
      columnHint,
    );
  } else {
    right = convertAstToExpression(ast.right, context);
  }

  const operator = ast.operator;

  if (!left || !right) {
    throw new Error(
      `Failed to convert binary expression with operator '${operator}'. ` +
        `Left side: ${left ? "converted" : "failed"}, Right side: ${right ? "converted" : "failed"}`,
    );
  }

  // Comparison operators
  if (["==", "===", "!=", "!==", ">", ">=", "<", "<="].includes(operator)) {
    const op = operator === "===" ? "==" : operator === "!==" ? "!=" : operator;
    return {
      type: "comparison",
      operator: op as "==" | "!=" | ">" | ">=" | "<" | "<=",
      left: left as ValueExpression,
      right: right as ValueExpression,
    } as ComparisonExpression;
  }

  // Check for string concatenation
  if (operator === "+") {
    // Validate expressions without table context in SELECT projections
    if (context.inSelectProjection && context.hasTableParam === false) {
      const leftIsNonTableParam =
        left.type === "constant" ||
        (left.type === "param" && !context.tableParams.has((left as ParameterExpression).param));
      const rightIsNonTableParam =
        right.type === "constant" ||
        (right.type === "param" && !context.tableParams.has((right as ParameterExpression).param));

      if (leftIsNonTableParam && rightIsNonTableParam) {
        throw new Error(
          "Expressions without table context are not allowed in SELECT projections. " +
            "Use a table parameter (e.g., select(i => ...) instead of select(() => ...)).",
        );
      }
    }
    // Treat as concat if we have a string literal or concat expression
    const leftIsString =
      (left.type === "constant" && typeof (left as ConstantExpression).value === "string") ||
      left.type === "concat"; // Already a concat expression
    const rightIsString =
      (right.type === "constant" && typeof (right as ConstantExpression).value === "string") ||
      right.type === "concat";

    // Also check for string-like column/parameter names (heuristic)
    const leftLikelyString =
      (left.type === "column" && isLikelyStringColumn((left as ColumnExpression).name)) ||
      (left.type === "param" && isLikelyStringParam((left as ParameterExpression).property));
    const rightLikelyString =
      (right.type === "column" && isLikelyStringColumn((right as ColumnExpression).name)) ||
      (right.type === "param" && isLikelyStringParam((right as ParameterExpression).property));

    if (leftIsString || rightIsString || leftLikelyString || rightLikelyString) {
      // For string concatenation, use the already converted left and right
      // which have column hints if applicable (from the earlier conversion)
      return {
        type: "concat",
        left: left as ValueExpression,
        right: right as ValueExpression,
      } as ConcatExpression;
    }
  }

  // Arithmetic operators
  if (["+", "-", "*", "/", "%"].includes(operator)) {
    return {
      type: "arithmetic",
      operator: operator as "+" | "-" | "*" | "/" | "%",
      left: left as ValueExpression,
      right: right as ValueExpression,
    } as ArithmeticExpression;
  }

  return null;
}

export function convertLogicalExpression(
  ast: ASTLogicalExpression,
  context: ConversionContext,
): Expression | null {
  const left = convertAstToExpression(ast.left, context);
  const right = convertAstToExpression(ast.right, context);

  if (!left || !right) {
    throw new Error(
      `Failed to convert logical expression with operator '${ast.operator}'. ` +
        `Left side: ${left ? "converted" : "failed"}, Right side: ${right ? "converted" : "failed"}`,
    );
  }

  // Convert columns to booleanColumns if needed
  let finalLeft = left;
  if (left.type === "column") {
    finalLeft = {
      type: "booleanColumn",
      name: (left as ColumnExpression).name,
    };
  }

  let finalRight = right;
  if (right.type === "column") {
    finalRight = {
      type: "booleanColumn",
      name: (right as ColumnExpression).name,
    };
  }

  if (isBooleanExpression(finalLeft) && isBooleanExpression(finalRight)) {
    return {
      type: "logical",
      operator: ast.operator === "&&" ? "and" : ast.operator === "||" ? "or" : ast.operator,
      left: finalLeft as BooleanExpression,
      right: finalRight as BooleanExpression,
    } as LogicalExpression;
  }

  // Handle ?? (nullish coalescing) as COALESCE
  if (ast.operator === "??" && isValueExpression(left) && isValueExpression(right)) {
    return {
      type: "coalesce",
      expressions: [left as ValueExpression, right as ValueExpression],
    } as CoalesceExpression;
  }

  // Handle || as coalesce when not both boolean expressions (for backward compatibility)
  if (ast.operator === "||" && isValueExpression(left) && isValueExpression(right)) {
    return {
      type: "coalesce",
      expressions: [left as ValueExpression, right as ValueExpression],
    } as CoalesceExpression;
  }

  return null;
}

export function convertLiteral(
  ast: Literal | NumericLiteral | StringLiteral | BooleanLiteral | NullLiteral,
  context: ConversionContext,
  columnHint?: string,
): ParameterExpression | ConstantExpression {
  let value: string | number | boolean | null;
  if (ast.type === "NumericLiteral") {
    value = (ast as NumericLiteral).value;
  } else if (ast.type === "StringLiteral") {
    value = (ast as StringLiteral).value;
  } else if (ast.type === "BooleanLiteral") {
    value = (ast as BooleanLiteral).value;
  } else if (ast.type === "NullLiteral") {
    value = null;
  } else {
    value = (ast as Literal).value;
  }

  // Special case for null - don't parameterize it so we can generate IS NULL/IS NOT NULL
  if (value === null) {
    return {
      type: "constant",
      value: null,
    } as ConstantExpression;
  }

  // Create auto-parameter with field context
  const paramName = createAutoParam(context, value, {
    fieldName: columnHint,
    tableName: context.currentTable,
  });

  // Return a parameter expression instead of constant
  return {
    type: "param",
    param: paramName,
  } as ParameterExpression;
}

export function convertCallExpression(
  ast: ASTCallExpression,
  context: ConversionContext,
): Expression | null {
  // Handle method calls
  if (ast.callee.type === "MemberExpression") {
    const memberCallee = ast.callee as ASTMemberExpression;

    // Check if this is an aggregate method on a grouping parameter
    // In C# LINQ, after groupBy, the parameter represents IGrouping<TKey, TElement>
    if (memberCallee.object.type === "Identifier" && memberCallee.property.type === "Identifier") {
      const objName = (memberCallee.object as Identifier).name;
      const methodName = (memberCallee.property as Identifier).name;

      // Check if this is a grouping parameter calling an aggregate method
      if (context.groupingParams && context.groupingParams.has(objName)) {
        // Handle aggregate methods on grouping
        if (["count", "sum", "avg", "average", "min", "max"].includes(methodName.toLowerCase())) {
          const aggregateFunc =
            methodName.toLowerCase() === "average" ? "avg" : methodName.toLowerCase();

          // For methods like sum, avg, min, max that can take a selector
          if (ast.arguments && ast.arguments.length > 0) {
            const selectorArg = ast.arguments[0];
            if (selectorArg && selectorArg.type === "ArrowFunctionExpression") {
              const arrowFunc = selectorArg as ArrowFunctionExpression;
              const paramName = getParameterName(arrowFunc);
              if (paramName) {
                context.tableParams.add(paramName);
              }

              const bodyExpr =
                arrowFunc.body.type === "BlockStatement"
                  ? getReturnExpression(arrowFunc.body.body)
                  : arrowFunc.body;

              if (bodyExpr) {
                const expr = convertAstToExpression(bodyExpr, context);
                if (expr && isValueExpression(expr)) {
                  return {
                    type: "aggregate",
                    function: aggregateFunc as "count" | "sum" | "avg" | "min" | "max",
                    expression: expr as ValueExpression,
                  } as AggregateExpression;
                }
              }
            }
          }

          // No arguments - just COUNT(*) or similar
          return {
            type: "aggregate",
            function: aggregateFunc as "count" | "sum" | "avg" | "min" | "max",
          } as AggregateExpression;
        }
      }
    }

    const obj = convertAstToExpression(memberCallee.object, context);

    if (memberCallee.property.type === "Identifier") {
      const methodName = (memberCallee.property as Identifier).name;

      // Special handling for array.includes() -> IN expression
      if (methodName === "includes") {
        // Check if obj is an array or a parameter that could be an array
        const isArrayLike = obj && (obj.type === "array" || obj.type === "param");

        if (isArrayLike) {
          // This is array.includes(value) which should become value IN (array)
          if (ast.arguments && ast.arguments.length === 1 && ast.arguments[0]) {
            const valueArg = convertAstToExpression(ast.arguments[0], context);
            if (valueArg && isValueExpression(valueArg)) {
              // If it's a parameter, we'll treat it as an array parameter
              // The SQL generator will handle it appropriately
              return {
                type: "in",
                value: valueArg as ValueExpression,
                list: obj as ArrayExpression | ParameterExpression,
              } as InExpression;
            }
          }
        }
      }

      if (obj && isValueExpression(obj)) {
        // Boolean methods for strings
        if (["startsWith", "endsWith", "includes", "contains"].includes(methodName)) {
          // Extract column hint from the method object for parameter naming
          let columnHint: string | undefined;
          if (obj.type === "column") {
            columnHint = (obj as ColumnExpression).name;
          }

          const args = ast.arguments.map((arg: ASTExpression) => {
            // Convert literals with column hint for better parameter names
            if (
              columnHint &&
              (arg.type === "Literal" ||
                arg.type === "NumericLiteral" ||
                arg.type === "StringLiteral" ||
                arg.type === "BooleanLiteral" ||
                arg.type === "NullLiteral")
            ) {
              return convertLiteral(
                arg as Literal | NumericLiteral | StringLiteral | BooleanLiteral | NullLiteral,
                context,
              );
            }
            return convertAstToExpression(arg, context);
          });
          return {
            type: "booleanMethod",
            object: obj as ValueExpression,
            method: methodName as "startsWith" | "endsWith" | "includes" | "contains",
            arguments: args.filter(Boolean) as ValueExpression[],
          } as BooleanMethodExpression;
        }

        // String methods - only support toLowerCase and toUpperCase
        if (["toLowerCase", "toUpperCase"].includes(methodName)) {
          return {
            type: "stringMethod",
            object: obj as ValueExpression,
            method: methodName as "toLowerCase" | "toUpperCase",
          } as StringMethodExpression;
        }
      }
    }
  }

  // Unsupported call expression
  throw new Error(
    `Unsupported call expression: ${ast.callee.type}. ` +
      `Method calls are only supported for specific string and boolean methods.`,
  );
}

export function convertObjectExpression(
  ast: ASTObjectExpression,
  context: ConversionContext,
): ObjectExpression | null {
  const properties: Record<string, Expression> = {};

  for (const prop of ast.properties) {
    // Handle spread operator
    if ("type" in prop && (prop as { type: string }).type === "SpreadElement") {
      const spreadProp = prop as unknown as {
        type: string;
        argument: { type: string; name: string };
      };
      const spreadArg = spreadProp.argument;
      if (spreadArg.type === "Identifier") {
        const spreadName = spreadArg.name;

        // Check if we're spreading the JOIN result and we have its shape
        if (context.joinResultParam === spreadName && context.currentResultShape) {
          // Helper function to flatten nested shape into properties
          const flattenShape = (shape: ObjectShapeNode, prefix: string = ""): void => {
            for (const [propName, shapeProp] of shape.properties) {
              const fullName = prefix ? `${prefix}.${propName}` : propName;

              if (shapeProp.type === "column") {
                // Direct column reference
                const colNode = shapeProp as ColumnShapeNode;
                properties[fullName] = {
                  type: "column",
                  name: colNode.columnName,
                  table: `$spread${colNode.sourceTable}`,
                } as ColumnExpression;
              } else if (shapeProp.type === "object") {
                // Nested object - recursively flatten
                flattenShape(shapeProp as ObjectShapeNode, fullName);
              } else if (shapeProp.type === "reference") {
                // Reference to entire table - we handle this by selecting all columns
                // The SQL generator will use SELECT * for references
                const refNode = shapeProp as ReferenceShapeNode;
                properties[fullName] = {
                  type: "column",
                  name: fullName,
                  table: `$spread${refNode.sourceTable}`,
                } as ColumnExpression;
              }
            }
          };

          // Flatten the result shape into properties
          flattenShape(context.currentResultShape);
        } else {
          // Spread operator requires shape information to correctly map properties
          throw new Error(
            `Spread operator used without shape information. ` +
              `This typically occurs when spreading a parameter '${spreadName}' that isn't from a JOIN result. ` +
              `Spread is only supported for JOIN result parameters with known shapes.`,
          );
        }
      }
      continue;
    }

    // Handle regular properties
    if (prop.key && prop.key.type === "Identifier") {
      const key = (prop.key as Identifier).name;
      const value = convertAstToExpression(prop.value, context);
      if (!value) return null;

      // Check if we're in a SELECT projection and the value is an expression (not a simple column/constant)
      if (context.inSelectProjection) {
        // Disallow comparison and other complex expressions in SELECT
        // Exception: Allow aggregate functions when after GROUP BY
        const isAfterGroupBy = context.groupingParams && context.groupingParams.size > 0;
        const isAggregate = value.type === "aggregate";
        const isSimpleValue =
          value.type === "column" || value.type === "constant" || value.type === "param";
        const isArithmetic = value.type === "arithmetic";
        const isCoalesce = value.type === "coalesce";

        if (!isSimpleValue && !isArithmetic && !isCoalesce && !(isAfterGroupBy && isAggregate)) {
          if (value.type === "comparison") {
            throw new Error(
              `Comparison expressions are not supported in SELECT projections. ` +
                `Property '${key}' contains a comparison expression (${prop.value.type}). ` +
                `Only simple column references, constants, arithmetic expressions, and aggregates (after GROUP BY) are allowed.`,
            );
          } else if (value.type === "logical") {
            throw new Error(
              `Logical expressions are not supported in SELECT projections. ` +
                `Property '${key}' contains a logical expression. ` +
                `Only simple column references, constants, arithmetic expressions, and aggregates (after GROUP BY) are allowed.`,
            );
          }
        }
      }

      properties[key] = value;
    } else if (prop.key && (prop.key.type === "Literal" || prop.key.type === "StringLiteral")) {
      const key = String((prop.key as Literal | StringLiteral).value);
      const value = convertAstToExpression(prop.value, context);
      if (!value) return null;

      // Check if we're in a SELECT projection and the value is an expression (not a simple column/constant)
      if (context.inSelectProjection) {
        // Disallow comparison and other complex expressions in SELECT
        // Exception: Allow aggregate functions when after GROUP BY
        const isAfterGroupBy = context.groupingParams && context.groupingParams.size > 0;
        const isAggregate = value.type === "aggregate";
        const isSimpleValue =
          value.type === "column" || value.type === "constant" || value.type === "param";
        const isArithmetic = value.type === "arithmetic";
        const isCoalesce = value.type === "coalesce";

        if (!isSimpleValue && !isArithmetic && !isCoalesce && !(isAfterGroupBy && isAggregate)) {
          if (value.type === "comparison") {
            throw new Error(
              `Comparison expressions are not supported in SELECT projections. ` +
                `Property '${key}' contains a comparison expression. ` +
                `Only simple column references, constants, arithmetic expressions, and aggregates (after GROUP BY) are allowed.`,
            );
          } else if (value.type === "logical") {
            throw new Error(
              `Logical expressions are not supported in SELECT projections. ` +
                `Property '${key}' contains a logical expression. ` +
                `Only simple column references, constants, arithmetic expressions, and aggregates (after GROUP BY) are allowed.`,
            );
          }
        }
      }

      properties[key] = value;
    }
  }

  return {
    type: "object",
    properties,
  };
}

export function convertArrayExpression(
  ast: ASTArrayExpression,
  context: ConversionContext,
): ArrayExpression | null {
  const elements: Expression[] = [];

  for (const element of ast.elements) {
    if (element) {
      const expr = convertAstToExpression(element, context);
      if (expr) {
        elements.push(expr);
      }
    }
  }

  return {
    type: "array",
    elements,
  };
}

export function convertLambdaExpression(
  ast: ArrowFunctionExpression,
  context: ConversionContext,
): Expression | null {
  const params = ast.params.map((p: Identifier) => ({ name: p.name }));

  // Handle both Expression body and BlockStatement body
  let bodyExpr: ASTExpression | null = null;
  if (ast.body.type === "BlockStatement") {
    // For block statements, look for a return statement
    bodyExpr = getReturnExpression(ast.body.body);
  } else {
    bodyExpr = ast.body;
  }

  if (!bodyExpr) return null;
  const body = convertAstToExpression(bodyExpr, context);
  if (!body) return null;

  return {
    type: "lambda",
    parameters: params,
    body,
  };
}

export function convertConditionalExpression(
  ast: ASTConditionalExpression,
  context: ConversionContext,
): ConditionalExpression | null {
  const condition = convertAstToExpression(ast.test, context);
  const thenExpr = convertAstToExpression(ast.consequent, context);
  const elseExpr = convertAstToExpression(ast.alternate, context);

  if (!condition || !thenExpr || !elseExpr) return null;

  // Convert condition to boolean expression if needed
  let booleanCondition: BooleanExpression;
  if (isBooleanExpression(condition)) {
    booleanCondition = condition as BooleanExpression;
  } else if (condition.type === "column") {
    // Convert column to booleanColumn
    booleanCondition = {
      type: "booleanColumn",
      name: (condition as ColumnExpression).name,
    };
  } else {
    // For other types, we can't convert to boolean safely
    return null;
  }

  return {
    type: "conditional",
    condition: booleanCondition,
    then: thenExpr,
    else: elseExpr,
  };
}
