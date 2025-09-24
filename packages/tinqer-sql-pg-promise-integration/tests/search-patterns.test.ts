/**
 * Search patterns integration tests with real PostgreSQL
 * Tests LIKE, startsWith, endsWith, includes patterns
 */

import { describe, it, before } from "mocha";
import { expect } from "chai";
import { from } from "@webpods/tinqer";
import { execute, executeSimple } from "@webpods/tinqer-sql-pg-promise";
import { setupExpandedTestDatabase, seedExpandedTestData } from "./expanded-test-setup.js";
import { db } from "./shared-db.js";
import { expandedDbContext as dbContext } from "./expanded-database-schema.js";

describe("PostgreSQL Integration - Search Patterns", () => {
  before(async () => {
    await setupExpandedTestDatabase(db);
    await seedExpandedTestData(db);
  });

  describe("StartsWith patterns", () => {
    it("should find records starting with pattern", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.name.startsWith("Product"))
          .select((p) => ({ id: p.id, name: p.name }))
          .take(10)
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.name).to.match(/^Product/);
      });
    });

    it("should handle startsWith with parameters", async () => {
      const params = { prefix: "User" };

      const results = await execute(
        db,
        (p) => from(dbContext, "users")
          .where((u) => u.name.startsWith(p.prefix))
          .select((u) => ({ name: u.name })),
        params
      );

      expect(results).to.be.an("array");
      results.forEach((user) => {
        expect(user.name).to.match(/^User/);
      });
    });

    it("should handle case-sensitive startsWith", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "categories")
          .where((c) => c.name.startsWith("Category"))
          .select((c) => ({ name: c.name }))
      );

      expect(results).to.be.an("array");
      // PostgreSQL LIKE is case-sensitive by default
      results.forEach((category) => {
        expect(category.name).to.match(/^Category/);
      });
    });

    it("should handle empty string prefix", async () => {
      const params = { prefix: "" };

      const results = await execute(
        db,
        (p) => from(dbContext, "products")
          .where((pr) => pr.name.startsWith(p.prefix))
          .count(),
        params
      );

      // Empty prefix should match all non-null names
      expect(results).to.be.greaterThan(0);
    });
  });

  describe("EndsWith patterns", () => {
    it("should find records ending with pattern", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .where((u) => u.email.endsWith(".com"))
          .select((u) => ({ email: u.email }))
          .take(10)
      );

      expect(results).to.be.an("array");
      results.forEach((user) => {
        expect(user.email).to.match(/\.com$/);
      });
    });

    it("should handle endsWith with parameters", async () => {
      const params = { suffix: "@example.com" };

      const results = await execute(
        db,
        (p) => from(dbContext, "users")
          .where((u) => u.email.endsWith(p.suffix))
          .select((u) => ({ email: u.email })),
        params
      );

      expect(results).to.be.an("array");
      results.forEach((user) => {
        expect(user.email).to.match(/@example\.com$/);
      });
    });

    it("should find products with specific SKU suffix", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.sku.endsWith("XL"))
          .select((p) => ({ sku: p.sku }))
      );

      expect(results).to.be.an("array");
      // May be empty if no SKUs end with XL
    });
  });

  describe("Contains/Includes patterns", () => {
    it("should find records containing pattern", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.description.includes("quality"))
          .select((p) => ({ 
            id: p.id, 
            description: p.description 
          }))
          .take(10)
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        if (product.description) {
          expect(product.description.toLowerCase()).to.include("quality");
        }
      });
    });

    it("should handle includes with parameters", async () => {
      const params = { searchTerm: "test" };

      const results = await execute(
        db,
        (p) => from(dbContext, "users")
          .where((u) => u.name.includes(p.searchTerm))
          .select((u) => ({ name: u.name })),
        params
      );

      expect(results).to.be.an("array");
      results.forEach((user) => {
        expect(user.name.toLowerCase()).to.include(params.searchTerm);
      });
    });

    it("should find emails containing specific domain", async () => {
      const params = { domain: "gmail" };

      const results = await execute(
        db,
        (p) => from(dbContext, "users")
          .where((u) => u.email.includes(p.domain))
          .select((u) => ({ email: u.email })),
        params
      );

      expect(results).to.be.an("array");
      results.forEach((user) => {
        expect(user.email).to.include(params.domain);
      });
    });
  });

  describe("Complex search patterns", () => {
    it("should combine multiple search patterns", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => 
            p.name.startsWith("Product") &&
            p.description.includes("premium")
          )
          .select((p) => ({ 
            name: p.name, 
            description: p.description 
          }))
          .take(10)
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.name).to.match(/^Product/);
        if (product.description) {
          expect(product.description.toLowerCase()).to.include("premium");
        }
      });
    });

    it("should handle OR conditions with patterns", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .where((u) => 
            u.email.endsWith(".com") ||
            u.email.endsWith(".org")
          )
          .select((u) => ({ email: u.email }))
          .take(20)
      );

      expect(results).to.be.an("array");
      results.forEach((user) => {
        expect(user.email).to.match(/\.(com|org)$/);
      });
    });

    it("should search multiple columns", async () => {
      const params = { search: "test" };

      const results = await execute(
        db,
        (p) => from(dbContext, "products")
          .where((pr) => 
            pr.name.includes(p.search) ||
            pr.description.includes(p.search) ||
            pr.sku.includes(p.search)
          )
          .select((pr) => ({ 
            id: pr.id,
            name: pr.name,
            description: pr.description,
            sku: pr.sku
          }))
          .take(10),
        params
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        const searchLower = params.search.toLowerCase();
        const hasMatch = 
          product.name.toLowerCase().includes(searchLower) ||
          (product.description?.toLowerCase().includes(searchLower) ?? false) ||
          product.sku.toLowerCase().includes(searchLower);
        expect(hasMatch).to.be.true;
      });
    });
  });

  describe("Pattern with special characters", () => {
    it("should handle patterns with SQL wildcards", async () => {
      // Test that % and _ are treated as literals, not wildcards
      const params = { pattern: "10%" };

      const results = await execute(
        db,
        (p) => from(dbContext, "products")
          .where((pr) => pr.description.includes(p.pattern))
          .select((pr) => ({ description: pr.description })),
        params
      );

      expect(results).to.be.an("array");
      // Should find literal "10%" not use % as wildcard
      results.forEach((product) => {
        if (product.description) {
          expect(product.description).to.include("10%");
        }
      });
    });

    it("should handle patterns with quotes", async () => {
      const params = { pattern: "it's" };

      const results = await execute(
        db,
        (p) => from(dbContext, "products")
          .where((pr) => pr.description.includes(p.pattern))
          .select((pr) => ({ description: pr.description })),
        params
      );

      expect(results).to.be.an("array");
      // Should handle apostrophes correctly
    });
  });

  describe("Pattern performance considerations", () => {
    it("should efficiently search with startsWith (uses index)", async () => {
      const startTime = Date.now();
      
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .where((u) => u.email.startsWith("user"))
          .count()
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(results).to.be.a("number");
      expect(duration).to.be.lessThan(1000); // Should be fast
    });

    it("should handle includes pattern (full table scan)", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .where((u) => u.email.includes("@"))
          .count()
      );

      expect(results).to.be.a("number");
      expect(results).to.be.greaterThan(0); // Most emails contain @
    });
  });

  describe("Pattern with NULL handling", () => {
    it("should handle patterns on nullable columns", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .where((u) => 
            u.phone !== null &&
            u.phone.startsWith("+1")
          )
          .select((u) => ({ phone: u.phone }))
      );

      expect(results).to.be.an("array");
      results.forEach((user) => {
        expect(user.phone).to.not.be.null;
        expect(user.phone).to.match(/^\+1/);
      });
    });

    it("should exclude NULL values in pattern search", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.description.includes("test"))
          .count()
      );

      // Should not throw error on NULL descriptions
      expect(results).to.be.a("number");
    });
  });

  describe("Pattern negation", () => {
    it("should find records NOT matching pattern", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .where((u) => !u.email.endsWith(".com"))
          .select((u) => ({ email: u.email }))
          .take(10)
      );

      expect(results).to.be.an("array");
      results.forEach((user) => {
        expect(user.email).to.not.match(/\.com$/);
      });
    });

    it("should combine NOT with other conditions", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => 
            p.price > 100 &&
            !p.name.startsWith("Premium")
          )
          .select((p) => ({ 
            name: p.name, 
            price: p.price 
          }))
          .take(10)
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.price).to.be.greaterThan(100);
        expect(product.name).to.not.match(/^Premium/);
      });
    });
  });
});