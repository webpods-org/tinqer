/**
 * Advanced SELECT projection integration tests with real PostgreSQL
 */

import { describe, it, before } from "mocha";
import { expect } from "chai";
import { from } from "@webpods/tinqer";
import { execute, executeSimple } from "@webpods/tinqer-sql-pg-promise";
import { setupExpandedTestDatabase, seedExpandedTestData } from "./expanded-test-setup.js";
import { db } from "./shared-db.js";
import { expandedDbContext as dbContext } from "./expanded-database-schema.js";

describe("PostgreSQL Integration - Advanced SELECT Projections", () => {
  before(async () => {
    await setupExpandedTestDatabase(db);
    await seedExpandedTestData(db);
  });

  describe("Computed fields and expressions", () => {
    it("should project with complex arithmetic computations", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.stock > 0 && p.cost !== null)
          .select((p) => ({
            id: p.id,
            name: p.name,
            price: p.price,
            cost: p.cost,
            profit: p.price - (p.cost ?? 0),
            profitMargin: ((p.price - (p.cost ?? 0)) / p.price) * 100,
            totalInventoryValue: p.price * p.stock,
            totalInventoryCost: (p.cost ?? 0) * p.stock,
            totalPotentialProfit: (p.price - (p.cost ?? 0)) * p.stock,
          }))
          .take(10),
      );

      expect(results).to.be.an("array");
      results.forEach((r) => {
        expect(r.profit).to.equal(r.price - (r.cost ?? 0));
        // Note: stock isn't in projection, so can't verify totalInventoryValue calculation
        expect(r).to.have.all.keys(
          "id",
          "name",
          "price",
          "cost",
          "profit",
          "profitMargin",
          "totalInventoryValue",
          "totalInventoryCost",
          "totalPotentialProfit",
        );
      });
    });

    it("should project with conditional expressions using ternary", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .select((p) => ({
            name: p.name,
            price: p.price,
            stock: p.stock,
            availability:
              p.stock > 100
                ? "High"
                : p.stock > 20
                  ? "Medium"
                  : p.stock > 0
                    ? "Low"
                    : "Out of Stock",
            priceCategory: p.price >= 1000 ? "Premium" : p.price >= 100 ? "Standard" : "Budget",
            isDiscountEligible: p.stock > 50 && p.price > 100,
          }))
          .take(15),
      );

      expect(results).to.be.an("array");
      results.forEach((r) => {
        expect(["High", "Medium", "Low", "Out of Stock"]).to.include(r.availability);
        expect(["Premium", "Standard", "Budget"]).to.include(r.priceCategory);
        expect(r.isDiscountEligible).to.be.a("boolean");
      });
    });

    it("should project with NULL coalescing", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .select((u) => ({
            id: u.id,
            name: u.name,
            displaySalary: u.salary ?? 0,
            department: u.department_id ?? -1,
            displayPhone: u.phone ?? "No phone",
            displayAddress: u.address ?? "No address",
            hasCompleteProfile: u.phone !== null && u.address !== null && u.salary !== null,
          }))
          .take(10),
      );

      expect(results).to.be.an("array");
      results.forEach((r) => {
        expect(r.displaySalary).to.be.a("number");
        expect(r.department).to.be.a("number");
        expect(r.displayPhone).to.be.a("string");
        expect(r.displayAddress).to.be.a("string");
        expect(r.hasCompleteProfile).to.be.a("boolean");
      });
    });
  });

  describe("Nested projections", () => {
    it("should handle deeply nested object projections", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.category_id !== null)
          .select((p) => ({
            basic: {
              id: p.id,
              name: p.name,
              sku: p.sku,
            },
            pricing: {
              current: p.price,
              cost: p.cost ?? 0,
              margin: p.price - (p.cost ?? 0),
            },
            inventory: {
              current: p.stock,
              status: p.stock > 50 ? "Good" : "Low",
            },
            metadata: {
              category: p.category_id,
              featured: p.is_featured,
              rating: p.rating ?? 0,
              reviews: p.review_count,
            },
          }))
          .take(5),
      );

      expect(results).to.be.an("array");
      results.forEach((r) => {
        expect(r).to.have.all.keys("basic", "pricing", "inventory", "metadata");
        expect(r.basic).to.have.all.keys("id", "name", "sku");
        expect(r.pricing).to.have.all.keys("current", "cost", "margin");
        expect(r.inventory).to.have.all.keys("current", "status");
        expect(r.metadata).to.have.all.keys("category", "featured", "rating", "reviews");
      });
    });
  });

  describe("Projections with aggregated data", () => {
    it("should project with GROUP BY and multiple aggregates", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "orders")
          .where((o) => o.user_id !== null)
          .groupBy((o) => ({
            userId: o.user_id,
            status: o.status,
          }))
          .select((g) => ({
            customer: g.key.userId,
            orderStatus: g.key.status,
            metrics: {
              count: g.count(),
              total: g.sum((o) => o.total_amount),
              average: g.average((o) => o.total_amount),
              min: g.min((o) => o.total_amount),
              max: g.max((o) => o.total_amount),
            },
            taxMetrics: {
              totalTax: g.sum((o) => o.tax_amount),
              avgTax: g.average((o) => o.tax_amount),
            },
          }))
          .take(10),
      );

      expect(results).to.be.an("array");
      results.forEach((r) => {
        expect(r).to.have.all.keys("customer", "orderStatus", "metrics", "taxMetrics");
        expect(r.metrics).to.have.all.keys("count", "total", "average", "min", "max");
        expect(r.taxMetrics).to.have.all.keys("totalTax", "avgTax");
        expect(r.metrics.count).to.be.greaterThan(0);
        expect(r.metrics.min).to.be.lessThanOrEqual(r.metrics.max);
      });
    });
  });

  describe("Projections with JOINed data", () => {
    it("should project computed fields from JOINed tables", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "order_items")
          .join(
            from(dbContext, "products"),
            (oi) => oi.product_id,
            (p) => p.id,
            (oi, p) => ({
              orderId: oi.order_id,
              productName: p.name,
              quantity: oi.quantity,
              unitPrice: oi.unit_price,
              productListPrice: p.price,
              lineTotal: oi.quantity * oi.unit_price,
              discountAmount: (p.price - oi.unit_price) * oi.quantity,
              discountPercent: ((p.price - oi.unit_price) / p.price) * 100,
            }),
          )
          .where((item) => item.discountAmount > 0)
          .take(10),
      );

      expect(results).to.be.an("array");
      results.forEach((r) => {
        expect(r.lineTotal).to.equal(r.quantity * r.unitPrice);
        expect(r.discountAmount).to.be.greaterThan(0);
        expect(r.discountPercent).to.be.greaterThan(0);
        expect(r.discountPercent).to.be.lessThanOrEqual(100);
      });
    });
  });

  describe("Projections with parameters", () => {
    it("should use parameters in projection calculations", async () => {
      const params = {
        taxRate: 0.08,
        discountPercent: 10,
        freeShippingThreshold: 100,
      };

      const results = await execute(
        db,
        (p) =>
          from(dbContext, "products")
            .where((pr) => pr.stock > 0)
            .select((pr) => ({
              id: pr.id,
              name: pr.name,
              originalPrice: pr.price,
              discountedPrice: pr.price * (1 - p.discountPercent / 100),
              savings: pr.price * (p.discountPercent / 100),
              priceWithTax: pr.price * (1 + p.taxRate),
              qualifiesForFreeShipping: pr.price >= p.freeShippingThreshold,
            }))
            .take(10),
        params,
      );

      expect(results).to.be.an("array");
      results.forEach((r) => {
        expect(r.discountedPrice).to.be.closeTo(r.originalPrice * 0.9, 0.01);
        expect(r.savings).to.be.closeTo(r.originalPrice * 0.1, 0.01);
        expect(r.priceWithTax).to.be.closeTo(r.originalPrice * 1.08, 0.01);
        expect(r.qualifiesForFreeShipping).to.equal(r.originalPrice >= 100);
      });
    });
  });

  describe("Edge cases and special projections", () => {
    it("should handle projection with all NULL-safe operations", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .select((u) => ({
            id: u.id,
            // Various NULL-safe operations
            salaryOrZero: u.salary ?? 0,
            hasSalary: u.salary !== null,
            salaryDisplay: u.salary !== null ? u.salary : -1,
            // Boolean with NULL
            isHighEarner: (u.salary ?? 0) > 100000,
            // Complex NULL chain
            locationInfo: {
              hasAddress: u.address !== null,
              hasCity: u.city !== null,
              hasCountry: u.country_id !== null,
              isComplete: u.address !== null && u.city !== null && u.country_id !== null,
            },
          }))
          .take(10),
      );

      expect(results).to.be.an("array");
      results.forEach((r) => {
        expect(r.salaryOrZero).to.be.a("number");
        expect(r.hasSalary).to.be.a("boolean");
        expect(r.isHighEarner).to.be.a("boolean");
        expect(r.locationInfo.isComplete).to.be.a("boolean");
      });
    });

    it("should project with complex boolean logic", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .select((p) => ({
            id: p.id,
            name: p.name,
            // Complex boolean expressions
            isPopular: p.rating !== null && p.rating >= 4 && p.review_count > 10,
            needsReview: p.review_count === 0 || (p.rating !== null && p.rating < 3),
            isHighValue: p.price > 500 && p.stock < 50,
            shouldPromote: p.is_featured && p.stock > 100 && (p.rating ?? 0) >= 4,
            inventoryAlert: p.stock < 10 || (p.stock < 50 && p.price > 1000),
          }))
          .take(20),
      );

      expect(results).to.be.an("array");
      results.forEach((r) => {
        expect(r.isPopular).to.be.a("boolean");
        expect(r.needsReview).to.be.a("boolean");
        expect(r.isHighValue).to.be.a("boolean");
        expect(r.shouldPromote).to.be.a("boolean");
        expect(r.inventoryAlert).to.be.a("boolean");
      });
    });
  });
});
