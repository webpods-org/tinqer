/**
 * Numeric edge cases integration tests with real PostgreSQL
 * Tests various numeric boundaries, precision, and edge conditions
 */

import { describe, it, before } from "mocha";
import { expect } from "chai";
import { from } from "@webpods/tinqer";
import { execute, executeSimple } from "@webpods/tinqer-sql-pg-promise";
import { setupExpandedTestDatabase, seedExpandedTestData } from "./expanded-test-setup.js";
import { db } from "./shared-db.js";
import { expandedDbContext as dbContext } from "./expanded-database-schema.js";

describe("PostgreSQL Integration - Numeric Edge Cases", () => {
  before(async () => {
    await setupExpandedTestDatabase(db);
    await seedExpandedTestData(db);
  });

  describe("Integer boundaries", () => {
    it("should handle maximum safe integer", async () => {
      const params = { maxInt: Number.MAX_SAFE_INTEGER };

      const results = await execute(
        db,
        (p) =>
          from(dbContext, "products")
            .where((pr) => pr.id < p.maxInt)
            .select((pr) => ({ id: pr.id }))
            .take(5),
        params,
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.id).to.be.lessThan(Number.MAX_SAFE_INTEGER);
      });
    });

    it("should handle minimum safe integer", async () => {
      const params = { minInt: Number.MIN_SAFE_INTEGER };

      const results = await execute(
        db,
        (p) =>
          from(dbContext, "products")
            .where((pr) => pr.id > p.minInt)
            .select((pr) => ({ id: pr.id }))
            .take(5),
        params,
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.id).to.be.greaterThan(Number.MIN_SAFE_INTEGER);
      });
    });

    it("should handle zero correctly", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.stock === 0)
          .select((p) => ({ id: p.id, stock: p.stock })),
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.stock).to.equal(0);
        expect(product.stock).to.not.be.null;
        expect(product.stock).to.not.be.undefined;
      });
    });

    it("should distinguish between 0, null, and undefined", async () => {
      const zeroCount = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.stock === 0)
          .count(),
      );

      const nullCount = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.stock === null)
          .count(),
      );

      const notNullCount = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.stock !== null)
          .count(),
      );

      expect(zeroCount).to.be.a("number");
      expect(nullCount).to.be.a("number");
      expect(notNullCount).to.be.a("number");
      expect(zeroCount + nullCount).to.be.lessThanOrEqual(notNullCount + nullCount);
    });
  });

  describe("Decimal precision", () => {
    it("should handle very small decimals", async () => {
      const params = {
        tiny: 0.000001,
        epsilon: 0.0000001,
      };

      const results = await execute(
        db,
        (p) =>
          from(dbContext, "products")
            .where((pr) => pr.price > p.tiny && pr.price < p.tiny * 10)
            .select((pr) => ({ price: pr.price })),
        params,
      );

      expect(results).to.be.an("array");
      // May be empty if no prices in this range
    });

    it("should handle large decimal values", async () => {
      const params = { largeDecimal: 999999.99 };

      const results = await execute(
        db,
        (p) =>
          from(dbContext, "orders")
            .where((o) => o.total_amount < p.largeDecimal)
            .select((o) => ({ total: o.total_amount }))
            .take(10),
        params,
      );

      expect(results).to.be.an("array");
      results.forEach((order) => {
        expect(order.total).to.be.lessThan(params.largeDecimal);
      });
    });

    it("should maintain precision in calculations", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "order_items")
          .select((oi) => ({
            quantity: oi.quantity,
            unitPrice: oi.unit_price,
            total: oi.quantity * oi.unit_price,
            // Test precision with division
            avgPrice: (oi.quantity * oi.unit_price) / oi.quantity,
          }))
          .take(10),
      );

      expect(results).to.be.an("array");
      results.forEach((item) => {
        // Average should equal unit price (x * y / x = y)
        expect(item.avgPrice).to.be.closeTo(item.unitPrice, 0.01);
      });
    });

    it("should handle currency calculations", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "orders")
          .select((o) => ({
            subtotal: o.total_amount - o.tax_amount - o.shipping_amount,
            tax: o.tax_amount,
            shipping: o.shipping_amount,
            total: o.total_amount,
            // Verify total calculation
            calculatedTotal:
              o.total_amount - o.tax_amount - o.shipping_amount + o.tax_amount + o.shipping_amount,
          }))
          .take(10),
      );

      expect(results).to.be.an("array");
      results.forEach((order) => {
        expect(order.calculatedTotal).to.be.closeTo(order.total, 0.01);
      });
    });
  });

  describe("Negative numbers", () => {
    it("should handle negative values in comparisons", async () => {
      const params = { negativeThreshold: -100 };

      const results = await execute(
        db,
        (p) =>
          from(dbContext, "products")
            .where((pr) => pr.price - (pr.cost ?? pr.price * 2) < p.negativeThreshold)
            .select((pr) => ({
              id: pr.id,
              price: pr.price,
              cost: pr.cost,
              profit: pr.price - (pr.cost ?? pr.price * 2), // Could be negative
            }))
            .take(10),
        params,
      );

      expect(results).to.be.an("array");
      // May be empty if no products have such negative profit
    });

    it("should handle negative in ORDER BY", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .select((p) => ({
            id: p.id,
            price: p.price,
            adjustedPrice: p.price - 1000, // Will be negative for cheaper products
          }))
          .orderBy((p) => p.price - 1000)
          .take(10),
      );

      expect(results).to.be.an("array");
      // Verify ordering including negative values
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.adjustedPrice).to.be.lessThanOrEqual(results[i]!.adjustedPrice);
      }
    });
  });

  describe("Division edge cases", () => {
    it("should handle division by zero protection", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .select((p) => ({
            id: p.id,
            stock: p.stock,
            // Protect against division by zero
            avgValuePerItem: p.stock > 0 ? (p.price * p.stock) / p.stock : 0,
          }))
          .take(20),
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.avgValuePerItem).to.not.be.NaN;
        expect(product.avgValuePerItem).to.be.finite;
      });
    });

    it("should handle percentage calculations", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "orders")
          .where((o) => o.total_amount > 0)
          .select((o) => ({
            id: o.id,
            total: o.total_amount,
            tax: o.tax_amount,
            taxRate: (o.tax_amount / o.total_amount) * 100,
            shippingRate: (o.shipping_amount / o.total_amount) * 100,
          }))
          .take(10),
      );

      expect(results).to.be.an("array");
      results.forEach((order) => {
        expect(order.taxRate).to.be.a("number");
        expect(order.taxRate).to.be.finite;
        expect(order.taxRate).to.be.within(0, 100);
        expect(order.shippingRate).to.be.within(0, 100);
      });
    });
  });

  describe("Rounding and precision", () => {
    it("should handle float to integer comparisons", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.price > 99.99 && p.price < 100.01)
          .select((p) => ({ id: p.id, price: p.price })),
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.price).to.be.within(99.99, 100.01);
      });
    });

    it("should handle precise equality checks", async () => {
      const params = { exactPrice: 99.99 };

      const results = await execute(
        db,
        (p) =>
          from(dbContext, "products")
            .where((pr) => pr.price === p.exactPrice)
            .select((pr) => ({ id: pr.id, price: pr.price })),
        params,
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.price).to.equal(params.exactPrice);
      });
    });
  });

  describe("Arithmetic overflow protection", () => {
    it("should handle large multiplications", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.stock > 0 && p.stock < 1000)
          .select((p) => ({
            id: p.id,
            stock: p.stock,
            price: p.price,
            totalValue: p.stock * p.price,
            // Large multiplication
            projectedValue: p.stock * p.price * 1000000,
          }))
          .take(10),
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.totalValue).to.be.finite;
        expect(product.projectedValue).to.be.finite;
        if (product.projectedValue < Number.MAX_SAFE_INTEGER) {
          expect(product.projectedValue).to.equal(product.totalValue * 1000000);
        }
      });
    });

    it("should handle very small divisions", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.price > 1000)
          .select((p) => ({
            id: p.id,
            price: p.price,
            microPrice: p.price / 1000000,
            nanoPrice: p.price / 1000000000,
          }))
          .take(5),
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.microPrice).to.be.greaterThan(0);
        expect(product.nanoPrice).to.be.greaterThan(0);
        expect(product.microPrice).to.be.finite;
      });
    });
  });

  describe("Numeric aggregation edge cases", () => {
    it("should handle SUM with large numbers", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "orders")
          .groupBy((o) => o.status)
          .select((g) => ({
            status: g.key,
            totalRevenue: g.sum((o) => o.total_amount),
            count: g.count(),
          })),
      );

      expect(results).to.be.an("array");
      results.forEach((group) => {
        expect(group.totalRevenue).to.be.finite;
        expect(group.totalRevenue).to.be.greaterThan(0);
      });
    });

    it("should handle AVG with mixed NULL and numbers", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .groupBy((u) => u.department_id)
          .select((g) => ({
            deptId: g.key,
            avgAge: g.average((u) => u.age ?? 0),
            avgSalary: g.average((u) => u.salary ?? 0),
          })),
      );

      expect(results).to.be.an("array");
      results.forEach((dept) => {
        expect(dept.avgAge).to.be.a("number");
        expect(dept.avgAge).to.be.finite;
        expect(dept.avgSalary).to.be.finite;
      });
    });

    it("should handle MIN/MAX with edge values", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .groupBy((p) => p.category_id)
          .select((g) => ({
            categoryId: g.key,
            minPrice: g.min((p) => p.price),
            maxPrice: g.max((p) => p.price),
            priceRange: g.max((p) => p.price) - g.min((p) => p.price),
          })),
      );

      expect(results).to.be.an("array");
      results.forEach((category) => {
        expect(category.minPrice).to.be.lessThanOrEqual(category.maxPrice);
        expect(category.priceRange).to.be.greaterThanOrEqual(0);
        expect(category.priceRange).to.be.finite;
      });
    });
  });

  describe("Numeric type coercion", () => {
    it("should handle implicit numeric conversions", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .select((p) => ({
            id: p.id,
            // Integer * decimal
            totalValue: p.stock * p.price,
            // Integer division resulting in decimal
            avgItemValue: p.price / (p.stock > 0 ? p.stock : 1),
          }))
          .take(10),
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.totalValue).to.be.a("number");
        expect(product.avgItemValue).to.be.a("number");
      });
    });

    it("should handle comparisons between different numeric types", async () => {
      const params = {
        intValue: 100,
        floatValue: 100.0,
        decimalValue: 100.0,
      };

      const results = await execute(
        db,
        (p) =>
          from(dbContext, "products")
            .where(
              (pr) =>
                pr.price === p.intValue || pr.price === p.floatValue || pr.price === p.decimalValue,
            )
            .select((pr) => ({ id: pr.id, price: pr.price })),
        params,
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.price).to.equal(100);
      });
    });
  });

  describe("Special numeric values", () => {
    it("should handle Infinity checks", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.price < 999999999) // Not Infinity
          .select((p) => ({
            id: p.id,
            price: p.price,
            // Ensure no Infinity in calculations
            safeCalculation: p.price * 1000 < 999999999999,
          }))
          .take(10),
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.price).to.be.finite;
        expect(product.safeCalculation).to.be.a("boolean");
      });
    });

    it("should handle very close numeric comparisons", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.price > 99.98999999 && p.price < 99.99000001)
          .select((p) => ({ id: p.id, price: p.price })),
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.price).to.be.closeTo(99.99, 0.01);
      });
    });
  });
});
