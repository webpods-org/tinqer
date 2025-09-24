/**
 * Edge cases and boundary value tests with real PostgreSQL
 */

import { describe, it, before } from "mocha";
import { expect } from "chai";
import { from } from "@webpods/tinqer";
import { execute, executeSimple } from "@webpods/tinqer-sql-pg-promise";
import { setupExpandedTestDatabase, seedExpandedTestData } from "./expanded-test-setup.js";
import { db } from "./shared-db.js";
import { expandedDbContext as dbContext } from "./expanded-database-schema.js";

describe("PostgreSQL Integration - Edge Cases and Boundary Values", () => {
  before(async () => {
    await setupExpandedTestDatabase(db);
    await seedExpandedTestData(db);
  });

  describe("Numeric boundary values", () => {
    it("should handle maximum safe integer values", async () => {
      const params = {
        maxValue: Number.MAX_SAFE_INTEGER,
        minValue: Number.MIN_SAFE_INTEGER
      };

      const results = await execute(
        db,
        (p) => from(dbContext, "products")
          .where((pr) =>
            pr.price < p.maxValue &&
            pr.price > p.minValue
          )
          .select((pr) => ({ id: pr.id, price: pr.price }))
          .take(5),
        params
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.price).to.be.lessThan(Number.MAX_SAFE_INTEGER);
        expect(product.price).to.be.greaterThan(Number.MIN_SAFE_INTEGER);
      });
    });

    it("should handle zero values correctly", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.stock === 0)
          .select((p) => ({ id: p.id, name: p.name, stock: p.stock }))
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.stock).to.equal(0);
      });
    });

    it("should handle negative numbers", async () => {
      // Test with negative values in calculations
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.cost !== null)
          .select((p) => ({
            id: p.id,
            price: p.price,
            cost: p.cost,
            loss: (p.cost ?? 0) - p.price // Could be negative (profit)
          }))
          .take(10)
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.loss).to.be.a("number");
        // Loss could be negative (which means profit)
      });
    });

    it("should handle very small decimal values", async () => {
      const params = {
        epsilon: 0.000001,
        threshold: 0.01
      };

      const results = await execute(
        db,
        (p) => from(dbContext, "products")
          .where((pr) =>
            pr.price > p.epsilon &&
            pr.price < p.threshold
          )
          .select((pr) => ({ price: pr.price })),
        params
      );

      expect(results).to.be.an("array");
      // Products with very small prices
    });
  });

  describe("String boundary cases", () => {
    it("should handle empty strings", async () => {
      const params = { emptyString: "" };

      const results = await execute(
        db,
        (p) => from(dbContext, "products")
          .where((pr) => pr.description === p.emptyString)
          .select((pr) => ({ id: pr.id, description: pr.description })),
        params
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.description).to.equal("");
      });
    });

    it("should handle very long strings", async () => {
      const longString = "a".repeat(1000); // 1000 character string
      const params = { search: longString };

      const results = await execute(
        db,
        (p) => from(dbContext, "products")
          .where((pr) => pr.description === p.search)
          .select((pr) => ({ id: pr.id })),
        params
      );

      expect(results).to.be.an("array");
      // Should handle without truncation or error
    });

    it("should handle strings with only whitespace", async () => {
      const whitespaceStrings = [
        " ",
        "  ",
        "\t",
        "\n",
        "\r\n",
        " \t \n "
      ];

      for (const ws of whitespaceStrings) {
        const params = { whitespace: ws };

        const results = await execute(
          db,
          (p) => from(dbContext, "users")
            .where((u) => u.name === p.whitespace)
            .select((u) => ({ name: u.name })),
          params
        );

        expect(results).to.be.an("array");
      }
    });

    it("should handle Unicode and special characters", async () => {
      const unicodeStrings = [
        "😀🎉🚀", // Emojis
        "你好世界", // Chinese
        "مرحبا", // Arabic
        "Здравствуй", // Russian
        "café", // Accented characters
        "™®©", // Special symbols
      ];

      for (const unicode of unicodeStrings) {
        const params = { text: unicode };

        const results = await execute(
          db,
          (p) => from(dbContext, "products")
            .where((pr) => pr.name === p.text)
            .select((pr) => ({ name: pr.name })),
          params
        );

        expect(results).to.be.an("array");
        // Should handle Unicode without errors
      }
    });
  });

  describe("Array boundary cases", () => {
    it("should handle empty arrays in IN operations", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .where((u) => ([] as number[]).includes(u.id))
      );

      expect(results).to.be.an("array");
      expect(results.length).to.equal(0); // Empty IN should return no results
    });

    it("should handle single element arrays", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .where((u) => [1].includes(u.id))
          .select((u) => ({ id: u.id }))
      );

      expect(results).to.be.an("array");
      results.forEach((user) => {
        expect(user.id).to.equal(1);
      });
    });

    it("should handle large arrays in IN operations", async () => {
      const largeArray = Array.from({ length: 100 }, (_, i) => i + 1);

      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => largeArray.includes(p.id))
          .select((p) => ({ id: p.id }))
          .take(50)
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(largeArray).to.include(product.id);
      });
    });
  });

  describe("NULL handling edge cases", () => {
    it("should handle all NULL columns", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .where((u) =>
            u.phone === null &&
            u.address === null &&
            u.salary === null &&
            u.department_id === null
          )
          .select((u) => ({
            id: u.id,
            phone: u.phone,
            address: u.address,
            salary: u.salary
          }))
      );

      expect(results).to.be.an("array");
      results.forEach((user) => {
        expect(user.phone).to.be.null;
        expect(user.address).to.be.null;
        expect(user.salary).to.be.null;
      });
    });

    it("should handle NULL in arithmetic operations", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.cost === null)
          .select((p) => ({
            id: p.id,
            profit: p.price - (p.cost ?? 0),
            nullProfit: p.price - p.cost! // This would be NULL
          }))
          .take(5)
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.profit).to.be.a("number");
        // nullProfit would be NULL in SQL but might cause issues
      });
    });
  });

  describe("Pagination boundary cases", () => {
    it("should handle SKIP 0", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .orderBy((p) => p.id)
          .skip(0)
          .take(5)
          .select((p) => ({ id: p.id }))
      );

      expect(results).to.be.an("array");
      expect(results.length).to.equal(5);
      expect(results[0]!.id).to.equal(1); // Should start from first record
    });

    it("should handle TAKE 0", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .take(0)
          .select((p) => ({ id: p.id }))
      );

      expect(results).to.be.an("array");
      expect(results.length).to.equal(0);
    });

    it("should handle very large SKIP values", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .skip(999999)
          .take(10)
          .select((p) => ({ id: p.id }))
      );

      expect(results).to.be.an("array");
      expect(results.length).to.equal(0); // Should return empty when skip exceeds row count
    });

    it("should handle very large TAKE values", async () => {
      const allProducts = await executeSimple(db, () =>
        from(dbContext, "products").count()
      );

      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .take(999999)
          .select((p) => ({ id: p.id }))
      );

      expect(results).to.be.an("array");
      expect(results.length).to.equal(allProducts); // Should return all available rows
    });
  });

  describe("Boolean edge cases", () => {
    it("should handle all boolean combinations", async () => {
      // Test true
      const activeUsers = await executeSimple(db, () =>
        from(dbContext, "users")
          .where((u) => u.is_active === true)
          .count()
      );

      // Test false
      const inactiveUsers = await executeSimple(db, () =>
        from(dbContext, "users")
          .where((u) => u.is_active === false)
          .count()
      );

      // Test NOT
      const notActiveUsers = await executeSimple(db, () =>
        from(dbContext, "users")
          .where((u) => !u.is_active)
          .count()
      );

      expect(activeUsers).to.be.a("number");
      expect(inactiveUsers).to.be.a("number");
      expect(notActiveUsers).to.equal(inactiveUsers);
    });

    it("should handle boolean with NULL", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .select((p) => ({
            id: p.id,
            isFeatured: p.is_featured,
            notFeatured: !p.is_featured,
            featuredOrNull: p.is_featured ?? false
          }))
          .take(10)
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.isFeatured).to.be.a("boolean");
        expect(product.notFeatured).to.equal(!product.isFeatured);
        expect(product.featuredOrNull).to.be.a("boolean");
      });
    });
  });

  describe("Date/Time boundary cases", () => {
    it("should handle far future dates", async () => {
      const farFuture = new Date("2099-12-31");
      const params = { futureDate: farFuture };

      const results = await execute(
        db,
        (p) => from(dbContext, "orders")
          .where((o) => o.order_date < p.futureDate)
          .count(),
        params
      );

      expect(results).to.be.a("number");
      expect(results).to.be.greaterThan(0); // All current orders should be before 2099
    });

    it("should handle very old dates", async () => {
      const veryOld = new Date("1900-01-01");
      const params = { oldDate: veryOld };

      const results = await execute(
        db,
        (p) => from(dbContext, "orders")
          .where((o) => o.order_date > p.oldDate)
          .count(),
        params
      );

      expect(results).to.be.a("number");
      expect(results).to.be.greaterThan(0); // All orders should be after 1900
    });
  });

  describe("Performance boundary cases", () => {
    it("should handle queries returning all rows", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
      );

      expect(results).to.be.an("array");
      expect(results.length).to.be.greaterThan(0);
      // Should handle without timeout or memory issues
    });

    it("should handle deeply nested conditions", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) =>
            (p.price > 100 && p.price < 200) ||
            (p.price > 200 && p.price < 300) ||
            (p.price > 300 && p.price < 400) ||
            (p.price > 400 && p.price < 500) ||
            (p.price > 500 && p.price < 600) ||
            (p.price > 600 && p.price < 700) ||
            (p.price > 700 && p.price < 800) ||
            (p.price > 800 && p.price < 900)
          )
          .select((p) => ({ id: p.id, price: p.price }))
          .take(20)
      );

      expect(results).to.be.an("array");
      // Should handle complex conditions without stack overflow
    });
  });
});