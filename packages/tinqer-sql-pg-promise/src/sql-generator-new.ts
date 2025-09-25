/**
 * SQL Generator for new architecture
 */

import type {
  QueryOperation,
  TableOperation,
  WhereOperation,
  SelectOperation,
  GroupByOperation,
  OrderByOperation,
  OrderByDescendingOperation,
  JoinOperation,
  SkipOperation,
  TakeOperation,
} from "@webpods/tinqer";

import { generateExpression, type SqlGeneratorContext } from "./expression-generator-new.js";

/**
 * Generate SQL from a QueryOperation tree
 */
export function generateSql(operation: QueryOperation, _params?: Record<string, unknown>): string {
  const context: SqlGeneratorContext = {
    paramPrefix: "$",
    isGrouped: false,
  };

  // Build SQL by traversing the operation tree
  const sql = generateOperation(operation, context, _params);
  return sql;
}

/**
 * Generate SQL for a single operation
 */
function generateOperation(
  operation: QueryOperation,
  context: SqlGeneratorContext,
  _params?: Record<string, unknown>,
): string {
  // Collect all operations in chain
  const operations = collectOperations(operation);

  // Determine if we have GROUP BY
  const hasGroupBy = operations.some((op) => op.type === "groupBy");

  // Build SQL clauses
  const clauses: string[] = [];

  // Find the source table
  const tableOp = operations.find((op) => op.type === "table") as TableOperation | undefined;
  if (!tableOp) {
    throw new Error("No source table found");
  }

  // SELECT clause
  const selectOp = operations.find((op) => op.type === "select") as SelectOperation | undefined;
  if (selectOp && selectOp.expression) {
    const selectSql = generateExpression(selectOp.expression, {
      ...context,
      isGrouped: hasGroupBy,
      tableAlias: tableOp.table,
    });
    clauses.push(`SELECT ${selectSql}`);
  } else {
    clauses.push(`SELECT *`);
  }

  // FROM clause
  clauses.push(`FROM "${tableOp.table}"`);

  // JOIN clauses
  const joinOps = operations.filter((op) => op.type === "join") as JoinOperation[];
  for (const joinOp of joinOps) {
    if (joinOp.outerKeyExpression && joinOp.innerKeyExpression) {
      const innerTable = getSourceTable(joinOp.inner);
      const outerKey = generateExpression(joinOp.outerKeyExpression, {
        ...context,
        tableAlias: tableOp.table,
      });
      const innerKey = generateExpression(joinOp.innerKeyExpression, {
        ...context,
        tableAlias: innerTable,
      });
      clauses.push(`JOIN "${innerTable}" ON ${outerKey} = ${innerKey}`);
    }
  }

  // WHERE clause (before GROUP BY)
  const whereOps = operations.filter((op) => op.type === "where") as WhereOperation[];
  const preGroupWhereOps = hasGroupBy
    ? whereOps.slice(
        0,
        whereOps.findIndex(
          (w) => operations.indexOf(w) > operations.findIndex((op) => op.type === "groupBy"),
        ),
      )
    : whereOps;

  if (preGroupWhereOps.length > 0) {
    const conditions = preGroupWhereOps
      .filter((w) => w.expression)
      .map((w) => generateExpression(w.expression!, context));
    if (conditions.length > 0) {
      clauses.push(`WHERE ${conditions.join(" AND ")}`);
    }
  }

  // GROUP BY clause
  const groupByOp = operations.find((op) => op.type === "groupBy") as GroupByOperation | undefined;
  if (groupByOp && groupByOp.keyExpression) {
    const groupKey = generateExpression(groupByOp.keyExpression, context);
    clauses.push(`GROUP BY ${groupKey}`);
    context.isGrouped = true;
  }

  // HAVING clause (after GROUP BY)
  if (hasGroupBy) {
    const postGroupWhereOps = whereOps.slice(
      whereOps.findIndex(
        (w) => operations.indexOf(w) > operations.findIndex((op) => op.type === "groupBy"),
      ) + 1,
    );

    if (postGroupWhereOps.length > 0) {
      const conditions = postGroupWhereOps
        .filter((w) => w.expression)
        .map((w) =>
          generateExpression(w.expression!, {
            ...context,
            isGrouped: true,
          }),
        );
      if (conditions.length > 0) {
        clauses.push(`HAVING ${conditions.join(" AND ")}`);
      }
    }
  }

  // ORDER BY clause
  const orderByOps = operations.filter(
    (op) => op.type === "orderBy" || op.type === "orderByDescending",
  ) as (OrderByOperation | OrderByDescendingOperation)[];

  if (orderByOps.length > 0) {
    const orderClauses = orderByOps
      .filter((o) => o.expression)
      .map((o) => {
        const expr = generateExpression(o.expression!, context);
        const dir = o.type === "orderByDescending" ? " DESC" : "";
        return `${expr}${dir}`;
      });
    if (orderClauses.length > 0) {
      clauses.push(`ORDER BY ${orderClauses.join(", ")}`);
    }
  }

  // LIMIT clause
  const takeOp = operations.find((op) => op.type === "take") as TakeOperation | undefined;
  if (takeOp) {
    clauses.push(`LIMIT ${takeOp.count}`);
  }

  // OFFSET clause
  const skipOp = operations.find((op) => op.type === "skip") as SkipOperation | undefined;
  if (skipOp) {
    clauses.push(`OFFSET ${skipOp.count}`);
  }

  // DISTINCT modifier
  const distinctOp = operations.find((op) => op.type === "distinct");
  if (distinctOp) {
    const selectIndex = clauses.findIndex((c) => c.startsWith("SELECT"));
    if (selectIndex >= 0 && clauses[selectIndex]) {
      clauses[selectIndex] = clauses[selectIndex].replace("SELECT", "SELECT DISTINCT");
    }
  }

  return clauses.join("\n");
}

/**
 * Collect all operations in the chain
 */
function collectOperations(operation: QueryOperation): QueryOperation[] {
  const operations: QueryOperation[] = [];
  let current: QueryOperation | undefined = operation;

  while (current) {
    operations.unshift(current);

    // Get the source operation
    if ("source" in current && current.source) {
      current = current.source as QueryOperation;
    } else if (current.type === "join" && "outer" in current) {
      current = (current as JoinOperation).outer;
    } else {
      current = undefined;
    }
  }

  return operations;
}

/**
 * Get the source table from an operation
 */
function getSourceTable(operation: QueryOperation): string {
  if (operation.type === "table") {
    return (operation as TableOperation).table;
  }
  if ("source" in operation && operation.source) {
    return getSourceTable(operation.source as QueryOperation);
  }
  return "unknown";
}
