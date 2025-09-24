/**
 * Test that SELECT projections properly reject unsupported expressions
 */

import { describe, it } from "mocha";
import { expect } from "chai";
import { parseQuery, from, createContext } from "../src/index.js";

describe("SELECT Expression Validation", () => {
  interface ProductsSchema {
    products: {
      id: number;
      name: string;
      price: number;
      stock: number;
      is_featured: boolean;
      category_id: number;
    };
  }

  const dbContext = createContext<ProductsSchema>();

  it("should reject comparison expressions in SELECT projections", () => {
    const queryBuilder = () =>
      from(dbContext, "products")
        .select((p) => ({
          id: p.id,
          name: p.name,
          hasStock: p.stock > 0, // This should throw an error
        }));

    expect(() => parseQuery(queryBuilder)).to.throw(
      "Comparison expressions are not supported in SELECT projections"
    );
  });

  it("should reject logical expressions in SELECT projections", () => {
    const queryBuilder = () =>
      from(dbContext, "products")
        .select((p) => ({
          id: p.id,
          name: p.name,
          featured: p.is_featured && p.stock > 0, // This should throw an error
        }));

    expect(() => parseQuery(queryBuilder)).to.throw(
      "Logical expressions are not supported in SELECT projections"
    );
  });

  it("should allow simple column references in SELECT", () => {
    const queryBuilder = () =>
      from(dbContext, "products")
        .select((p) => ({
          id: p.id,
          name: p.name,
          stock: p.stock,
        }));

    const result = parseQuery(queryBuilder);
    expect(result).to.exist;
    expect(result.operation.operationType).to.equal("select");
  });

  it("should allow arithmetic expressions in SELECT", () => {
    const queryBuilder = () =>
      from(dbContext, "products")
        .select((p) => ({
          id: p.id,
          discountedPrice: p.price * 0.9,
        }));

    const result = parseQuery(queryBuilder);
    expect(result).to.exist;
    expect(result.operation.operationType).to.equal("select");
  });

  it("should allow constants in SELECT", () => {
    const queryBuilder = () =>
      from(dbContext, "products")
        .select((p) => ({
          id: p.id,
          status: "active",
          defaultStock: 100,
        }));

    const result = parseQuery(queryBuilder);
    expect(result).to.exist;
    expect(result.operation.operationType).to.equal("select");
  });

  it("should allow coalesce (null coalescing) in SELECT", () => {
    interface NullableProductsSchema {
      products: {
        id: number;
        name: string | null;
        description: string | null;
      };
    }

    const dbContextWithNullable = createContext<NullableProductsSchema>();

    const queryBuilder = () =>
      from(dbContextWithNullable, "products")
        .select((p) => ({
          id: p.id,
          name: p.name ?? "Unknown",
          desc: p.description ?? "No description",
        }));

    const result = parseQuery(queryBuilder);
    expect(result).to.exist;
    expect(result.operation.operationType).to.equal("select");
  });

  describe("GROUP BY context", () => {
    it("should allow aggregate functions after GROUP BY", () => {
      interface OrdersSchema {
        orders: {
          id: number;
          user_id: number;
          total_amount: number;
        };
      }

      const dbContext = createContext<OrdersSchema>();

      const queryBuilder = () =>
        from(dbContext, "orders")
          .groupBy((o) => o.user_id)
          .select((g) => ({
            userId: g.key,
            orderCount: g.count(),
            totalAmount: g.sum((o) => o.total_amount),
          }));

      const result = parseQuery(queryBuilder);
      expect(result).to.exist;
      // The final operation will be select after groupBy
      const selectOp = result.operation;
      expect(selectOp.operationType).to.equal("select");
    });
  });
});