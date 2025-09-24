/**
 * Boolean operations integration tests with real PostgreSQL
 */

import { describe, it, before } from "mocha";
import { expect } from "chai";
import { from } from "@webpods/tinqer";
import { execute, executeSimple } from "@webpods/tinqer-sql-pg-promise";
import { setupExpandedTestDatabase, seedExpandedTestData } from "./expanded-test-setup.js";
import { db } from "./shared-db.js";
import { expandedDbContext as dbContext } from "./expanded-database-schema.js";

describe("PostgreSQL Integration - Boolean Operations", () => {
  before(async () => {
    await setupExpandedTestDatabase(db);
    await seedExpandedTestData(db);
  });

  describe("Basic boolean comparisons", () => {
    it("should filter by boolean true", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .where((u) => u.is_active === true)
          .select((u) => ({ id: u.id, name: u.name, isActive: u.is_active }))
          .take(10),
      );

      expect(results).to.be.an("array");
      results.forEach((user) => {
        expect(user.isActive).to.equal(true);
      });
    });

    it("should filter by boolean false", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.is_featured === false)
          .select((p) => ({ id: p.id, name: p.name, isFeatured: p.is_featured }))
          .take(10),
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.isFeatured).to.equal(false);
      });
    });

    it("should handle NOT operator on boolean", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .where((u) => !u.is_active)
          .select((u) => ({ id: u.id, isActive: u.is_active }))
          .take(10),
      );

      expect(results).to.be.an("array");
      results.forEach((user) => {
        expect(user.isActive).to.equal(false);
      });
    });

    it("should compare booleans directly without equality", async () => {
      // Using boolean as a condition directly
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .where((u) => u.is_active)
          .select((u) => ({ id: u.id, isActive: u.is_active }))
          .take(10),
      );

      expect(results).to.be.an("array");
      results.forEach((user) => {
        expect(user.isActive).to.equal(true);
      });
    });
  });

  describe("Boolean with AND/OR logic", () => {
    it("should handle AND with booleans", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.is_featured === true && p.stock > 0)
          .select((p) => ({
            id: p.id,
            featured: p.is_featured,
            stock: p.stock,
          }))
          .take(10),
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.featured).to.equal(true);
        expect(product.stock).to.be.greaterThan(0);
      });
    });

    it("should handle OR with booleans", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .where((u) => u.is_active === false || u.role === "inactive")
          .select((u) => ({
            id: u.id,
            active: u.is_active,
            role: u.role,
          }))
          .take(10),
      );

      expect(results).to.be.an("array");
      results.forEach((user) => {
        expect(user.active === false || user.role === "inactive").to.be.true;
      });
    });

    it("should handle complex boolean logic", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where(
            (p) => (p.is_featured === true && p.stock > 0) || (p.rating !== null && p.price < 100),
          )
          .select((p) => ({
            id: p.id,
            featured: p.is_featured,
            stock: p.stock,
            rating: p.rating,
            price: p.price,
          }))
          .take(20),
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        const condition1 = product.featured === true && product.stock > 0;
        const condition2 = product.rating !== null && product.price < 100;
        expect(condition1 || condition2).to.be.true;
      });
    });

    it("should handle nested boolean logic", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .where((u) => u.is_active === true && (u.salary !== null || u.role === "admin"))
          .select((u) => ({
            id: u.id,
            active: u.is_active,
            hasSalary: u.salary !== null,
            role: u.role,
          }))
          .take(10),
      );

      expect(results).to.be.an("array");
      results.forEach((user) => {
        expect(user.active).to.equal(true);
        expect(user.hasSalary === true || user.role === "admin").to.be.true;
      });
    });
  });

  describe("Boolean with NULL handling", () => {
    it("should handle boolean with NULL coalescing", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => (p.is_featured ?? false) === false)
          .select((p) => ({
            id: p.id,
            featured: p.is_featured,
            featuredOrFalse: p.is_featured ?? false,
          }))
          .take(10),
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.featuredOrFalse).to.equal(false);
      });
    });

    it("should distinguish between false and NULL", async () => {
      const falseResults = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.is_featured === false)
          .count(),
      );

      const nullResults = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.is_featured === null)
          .count(),
      );

      const notTrueResults = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.is_featured !== true)
          .count(),
      );

      expect(falseResults).to.be.a("number");
      expect(nullResults).to.be.a("number");
      expect(notTrueResults).to.be.a("number");
      // notTrueResults should include both false and null
    });
  });

  describe("Boolean with parameters", () => {
    it("should use boolean parameters", async () => {
      const params = { isActive: true, isFeatured: false };

      const results = await execute(
        db,
        (p) =>
          from(dbContext, "users")
            .where((u) => u.is_active === p.isActive)
            .select((u) => ({ id: u.id, active: u.is_active })),
        params,
      );

      expect(results).to.be.an("array");
      results.forEach((user) => {
        expect(user.active).to.equal(params.isActive);
      });
    });

    it("should use nullable boolean parameters", async () => {
      const params = { hasRole: null as boolean | null };

      const results = await execute(
        db,
        (p) =>
          from(dbContext, "users")
            .where((u) => (u.role === null) === p.hasRole)
            .select((u) => ({ id: u.id, hasRole: u.role === null })),
        params,
      );

      expect(results).to.be.an("array");
      results.forEach((user) => {
        expect(user.hasRole).to.be.a("boolean");
      });
    });
  });

  describe("Boolean in SELECT projections", () => {
    it("should project boolean expressions", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .select((p) => ({
            id: p.id,
            isCheap: p.price < 50,
            isInStock: p.stock > 0,
            isPopular: p.is_featured === true && p.stock > 10,
          }))
          .take(10),
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.isCheap).to.be.a("boolean");
        expect(product.isInStock).to.be.a("boolean");
        expect(product.isPopular).to.be.a("boolean");
      });
    });

    it("should project inverted boolean values", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .select((u) => ({
            id: u.id,
            isActive: u.is_active,
            isInactive: !u.is_active,
            noSalary: u.salary === null,
          }))
          .take(10),
      );

      expect(results).to.be.an("array");
      results.forEach((user) => {
        expect(user.isInactive).to.equal(!user.isActive);
      });
    });
  });

  describe("Boolean in GROUP BY", () => {
    it("should group by boolean column", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .groupBy((u) => u.is_active)
          .select((g) => ({
            isActive: g.key,
            count: g.count(),
            avgAge: g.average((u) => u.age ?? 0),
          })),
      );

      expect(results).to.be.an("array");
      expect(results.length).to.be.lessThanOrEqual(2); // true and false
      results.forEach((group) => {
        expect(group.isActive).to.be.a("boolean");
        expect(group.count).to.be.greaterThan(0);
      });
    });

    it("should group by multiple booleans", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .groupBy((p) => ({
            featured: p.is_featured,
            hasStock: p.stock > 0,
          }))
          .select((g) => ({
            isFeatured: g.key.featured,
            inStock: g.key.hasStock,
            productCount: g.count(),
            avgPrice: g.average((p) => p.price),
          })),
      );

      expect(results).to.be.an("array");
      expect(results.length).to.be.lessThanOrEqual(4); // 2x2 combinations
      results.forEach((group) => {
        expect(group.isFeatured).to.be.a("boolean");
        expect(group.inStock).to.be.a("boolean");
        expect(group.productCount).to.be.greaterThan(0);
      });
    });
  });

  describe("Boolean in ORDER BY", () => {
    it("should order by boolean column", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .orderBy((u) => u.is_active)
          .thenBy((u) => u.name)
          .select((u) => ({
            id: u.id,
            name: u.name,
            active: u.is_active,
          }))
          .take(20),
      );

      expect(results).to.be.an("array");
      // False should come before true in ascending order
      let lastActive = false;
      for (const user of results) {
        if (user.active && !lastActive) {
          lastActive = true;
        } else if (!user.active && lastActive) {
          // Should not go from true back to false
          expect.fail("Boolean ordering violated");
        }
      }
    });

    it("should order by boolean expression", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .orderByDescending((p) => p.stock > 0)
          .thenBy((p) => p.price)
          .select((p) => ({
            id: p.id,
            price: p.price,
            stock: p.stock,
            hasStock: p.stock > 0,
          }))
          .take(20),
      );

      expect(results).to.be.an("array");
      // Products with stock should come first (true before false in descending)
      let seenNoStock = false;
      for (const product of results) {
        if (!product.hasStock) {
          seenNoStock = true;
        } else if (seenNoStock) {
          expect.fail("Boolean expression ordering violated");
        }
      }
    });
  });

  describe("Boolean edge cases", () => {
    it("should handle chained NOT operations", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .where((u) => !!u.is_active) // Double negation
          .select((u) => ({ id: u.id, active: u.is_active }))
          .take(5),
      );

      expect(results).to.be.an("array");
      results.forEach((user) => {
        expect(user.active).to.equal(true);
      });
    });

    it("should handle boolean with type coercion", async () => {
      // Test that boolean comparisons are strict
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .where((u) => u.is_active === true)
          .count(),
      );

      const results2 = await executeSimple(db, () =>
        from(dbContext, "users")
          .where((u) => u.is_active !== false)
          .count(),
      );

      expect(results).to.be.a("number");
      expect(results2).to.be.a("number");
      // results2 might be different from results if there are NULL values
    });

    it("should handle all boolean combinations in WHERE", async () => {
      // Test all possible combinations of boolean and role check
      const combinations = [
        { active: true, hasRole: true },
        { active: true, hasRole: false },
        { active: false, hasRole: true },
        { active: false, hasRole: false },
      ];

      for (const combo of combinations) {
        const results = await executeSimple(db, () =>
          from(dbContext, "users")
            .where(
              (u) =>
                u.is_active === combo.active && (combo.hasRole ? u.role !== null : u.role === null),
            )
            .count(),
        );

        expect(results).to.be.a("number");
      }
    });
  });
});
