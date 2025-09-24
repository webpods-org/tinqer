/**
 * Advanced ORDER BY integration tests with real PostgreSQL
 */

import { describe, it, before } from "mocha";
import { expect } from "chai";
import { from } from "@webpods/tinqer";
import { execute, executeSimple } from "@webpods/tinqer-sql-pg-promise";
import { setupExpandedTestDatabase, seedExpandedTestData } from "./expanded-test-setup.js";
import { db } from "./shared-db.js";
import { expandedDbContext as dbContext } from "./expanded-database-schema.js";

describe("PostgreSQL Integration - Advanced ORDER BY", () => {
  before(async () => {
    await setupExpandedTestDatabase(db);
    await seedExpandedTestData(db);
  });

  describe("Multiple column ordering", () => {
    it("should order by multiple columns with mixed ASC/DESC", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .orderBy((p) => p.category_id)
          .thenByDescending((p) => p.price)
          .thenBy((p) => p.name)
          .take(20)
      );

      expect(results).to.be.an("array");
      expect(results.length).to.be.lessThanOrEqual(20);

      // Verify ordering
      for (let i = 1; i < results.length; i++) {
        const prev = results[i - 1]!;
        const curr = results[i]!;

        // First order by category_id ascending
        if (prev.category_id !== curr.category_id) {
          if (prev.category_id !== null && curr.category_id !== null) {
            expect(prev.category_id).to.be.lessThanOrEqual(curr.category_id);
          }
        } else if (prev.category_id === curr.category_id) {
          // Then by price descending within same category
          expect(prev.price).to.be.greaterThanOrEqual(curr.price);
        }
      }
    });

    it("should handle ORDER BY with NULL values", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .orderBy((u) => u.salary ?? 0) // NULL handling with coalesce
          .take(10)
      );

      expect(results).to.be.an("array");

      // Check that NULLs (treated as 0) come first
      let foundNonNull = false;
      results.forEach((user) => {
        if (user.salary !== null) {
          foundNonNull = true;
        }
        if (foundNonNull && user.salary === null) {
          // Should not find NULL after non-NULL when ordered
          expect.fail("Found NULL salary after non-NULL");
        }
      });
    });

    it("should order by computed expressions", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.stock > 0)
          .orderBy((p) => p.price * p.stock) // Order by total inventory value
          .take(10)
      );

      expect(results).to.be.an("array");

      // Verify ordering by computed value
      for (let i = 1; i < results.length; i++) {
        const prevValue = results[i - 1]!.price * results[i - 1]!.stock;
        const currValue = results[i]!.price * results[i]!.stock;
        expect(prevValue).to.be.lessThanOrEqual(currValue);
      }
    });
  });

  describe("ORDER BY with other operations", () => {
    it("should order after GROUP BY aggregates", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "orders")
          .groupBy((o) => ({ userId: o.user_id }))
          .select((g) => ({
            customerId: g.key.userId,
            orderCount: g.count(),
            totalSpent: g.sum((o) => o.total_amount)
          }))
          .orderByDescending((r) => r.totalSpent)
          .take(5)
      );

      expect(results).to.be.an("array");
      expect(results.length).to.be.lessThanOrEqual(5);

      // Verify descending order by totalSpent
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.totalSpent).to.be.greaterThanOrEqual(results[i]!.totalSpent);
      }
    });

    it("should order with DISTINCT", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .select((p) => ({ categoryId: p.category_id }))
          .distinct()
          .orderBy((r) => r.categoryId)
      );

      expect(results).to.be.an("array");

      // Check uniqueness
      const categoryIds = results.map(r => r.categoryId);
      const uniqueIds = [...new Set(categoryIds)];
      expect(categoryIds.length).to.equal(uniqueIds.length);

      // Check ordering
      for (let i = 1; i < results.length; i++) {
        if (results[i - 1]!.categoryId !== null && results[i]!.categoryId !== null) {
          expect(results[i - 1]!.categoryId).to.be.lessThanOrEqual(results[i]!.categoryId);
        }
      }
    });

    it("should order with JOIN results", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "orders")
          .join(
            from(dbContext, "users"),
            (o) => o.user_id,
            (u) => u.id,
            (o, u) => ({
              orderNumber: o.order_number,
              customerName: u.name,
              orderDate: o.order_date,
              total: o.total_amount
            })
          )
          .orderByDescending((r) => r.orderDate)
          .thenBy((r) => r.customerName)
          .take(10)
      );

      expect(results).to.be.an("array");
      expect(results.length).to.be.lessThanOrEqual(10);

      // Verify date ordering (descending)
      for (let i = 1; i < results.length; i++) {
        const prevDate = new Date(results[i - 1]!.orderDate).getTime();
        const currDate = new Date(results[i]!.orderDate).getTime();
        expect(prevDate).to.be.greaterThanOrEqual(currDate);
      }
    });
  });

  describe("Complex ordering scenarios", () => {
    it("should handle deep chain of thenBy operations", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .orderBy((u) => u.country_id ?? 999)
          .thenBy((u) => u.department_id ?? 999)
          .thenByDescending((u) => u.salary ?? 0)
          .thenBy((u) => u.name)
          .take(20)
      );

      expect(results).to.be.an("array");
      expect(results.length).to.be.lessThanOrEqual(20);
    });

    it("should order by boolean expressions", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .orderByDescending((p) => p.is_featured) // true first, then false
          .thenByDescending((p) => p.rating ?? 0)
          .take(15)
      );

      expect(results).to.be.an("array");

      // Featured products should come first
      let foundNonFeatured = false;
      results.forEach((product) => {
        if (!product.is_featured) {
          foundNonFeatured = true;
        }
        if (foundNonFeatured && product.is_featured) {
          expect.fail("Found featured product after non-featured");
        }
      });
    });

    it("should order with parameters", async () => {
      const params = {
        minPrice: 100,
        maxPrice: 1000
      };

      const results = await execute(
        db,
        (p) => from(dbContext, "products")
          .where((pr) => pr.price >= p.minPrice && pr.price <= p.maxPrice)
          .orderBy((pr) => pr.price)
          .take(10),
        params
      );

      expect(results).to.be.an("array");

      // Verify all results are within price range and ordered
      for (let i = 0; i < results.length; i++) {
        expect(results[i]!.price).to.be.at.least(params.minPrice);
        expect(results[i]!.price).to.be.at.most(params.maxPrice);

        if (i > 0) {
          expect(results[i]!.price).to.be.at.least(results[i - 1]!.price);
        }
      }
    });
  });
});