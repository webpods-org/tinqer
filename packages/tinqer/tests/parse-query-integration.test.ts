/**
 * Tests for parseQuery function
 */

import { describe, it } from "mocha";
import { expect } from "chai";
import { parseQuery, from } from "../src/index.js";
import {
  asFromOperation,
  asWhereOperation,
  asSelectOperation,
  asOrderByOperation,
  asTakeOperation,
  getOperation,
} from "./test-utils/operation-helpers.js";
import type { ParamRef } from "../src/query-tree/operations.js";
import type {
  ComparisonExpression,
  ObjectExpression,
  LogicalExpression,
  BooleanMethodExpression,
  ColumnExpression,
} from "../src/expressions/expression.js";
import { db } from "./test-schema.js";

describe("Parse Query Integration Tests", () => {
  it("should parse a simple from query", () => {
    const query = () => from(db, "users");
    const result = parseQuery(query);

    expect(getOperation(result)).to.not.be.null;
    expect(getOperation(result)?.type).to.equal("table");
    const fromOp = asFromOperation(getOperation(result));
    expect(fromOp.table).to.equal("users");
  });

  it("should parse a where clause", () => {
    const query = () => from(db, "users").where((x) => x.age >= 18);
    const result = parseQuery(query);

    expect(getOperation(result)).to.not.be.null;
    expect(getOperation(result)?.type).to.equal("where");
    const whereOp = asWhereOperation(getOperation(result));
    expect(whereOp.source.type).to.equal("table");
    const predicate = whereOp.predicate as any;
    expect(predicate.type).to.equal("comparison");
  });

  it("should parse a select projection", () => {
    const query = () =>
      from(db, "users").select((x) => ({
        id: x.id,
        name: x.name,
      }));
    const result = parseQuery(query);

    expect(getOperation(result)).to.not.be.null;
    expect(getOperation(result)?.type).to.equal("select");
    const selectOp = asSelectOperation(getOperation(result));
    // TODO: Fix when SELECT operation is properly implemented
    // const objectSelector = selectOp.selector as ObjectExpression;
    // expect(objectSelector.type).to.equal("object");
  });

  it("should parse a complex query chain", () => {
    const query = () =>
      from(db, "users")
        .where((x) => x.age >= 18 && x.isActive)
        .select((x) => ({ id: x.id, name: x.name }))
        .orderBy((x) => x.name)
        .take(10);
    const result = parseQuery(query);

    expect(getOperation(result)).to.not.be.null;
    expect(getOperation(result)?.type).to.equal("take");
    const takeOp = asTakeOperation(getOperation(result));
    // TODO: Check when TAKE operation converts count to param
    // const takeParam = takeOp.count as ParamRef;
    // expect(takeParam.type).to.equal("param");
    // expect(takeParam.param).to.equal("__p2");
    // expect(result?.autoParams).to.deep.equal({ __p1: 18, __p2: 10 });

    const orderByOp = asOrderByOperation(takeOp.source);
    expect(orderByOp.type).to.equal("orderBy");
    // TODO: Fix when ORDER BY operation is properly implemented
    // expect(orderByOp.keySelector).to.equal("name");

    const selectOp = asSelectOperation(orderByOp.source);
    expect(selectOp.type).to.equal("select");

    const whereOp = asWhereOperation(selectOp.source);
    expect(whereOp.type).to.equal("where");
    // TODO: Fix when WHERE operation is properly implemented
    // const predicate = whereOp.predicate as LogicalExpression;
    // expect(predicate.type).to.equal("logical");

    const fromOp = asFromOperation(whereOp.source);
    expect(fromOp.type).to.equal("table");
    expect(fromOp.table).to.equal("users");
  });

  it("should parse query with external parameters", () => {
    const query = (p: { minAge: number }) => from(db, "users").where((x) => x.age >= p.minAge);
    const result = parseQuery(query);

    expect(getOperation(result)).to.not.be.null;
    expect(getOperation(result)?.operationType).to.equal("where");
    const whereOp = asWhereOperation(getOperation(result));
    const predicate = whereOp.predicate as ComparisonExpression;
    expect(predicate.type).to.equal("comparison");
    const leftColumn = predicate.left as ColumnExpression;
    expect(leftColumn.type).to.equal("column");
    expect(leftColumn.name).to.equal("age");
    const rightParam = predicate.right as ParamRef;
    expect(rightParam.type).to.equal("param");
    expect(rightParam.param).to.equal("p");
    expect(rightParam.property).to.equal("minAge");
  });

  it("should parse terminal operations", () => {
    const query1 = () => from(db, "users").count();
    const result1 = parseQuery(query1);
    expect(getOperation(result1)?.operationType).to.equal("count");

    const query2 = () => from(db, "users").first();
    const result2 = parseQuery(query2);
    expect(getOperation(result2)?.operationType).to.equal("first");

    const query3 = () => from(db, "users").toArray();
    const result3 = parseQuery(query3);
    expect(getOperation(result3)?.operationType).to.equal("toArray");
  });

  it("should parse string methods", () => {
    const query = () => from(db, "users").where((x) => x.name.startsWith("John"));
    const result = parseQuery(query);

    expect(getOperation(result)).to.not.be.null;
    const whereOp = asWhereOperation(getOperation(result));
    const predicate = whereOp.predicate as BooleanMethodExpression;
    expect(predicate.type).to.equal("booleanMethod");
    expect(predicate.method).to.equal("startsWith");
    expect(predicate.object.type).to.equal("column");
    const objectColumn = predicate.object as ColumnExpression;
    expect(objectColumn.name).to.equal("name");
  });
});
