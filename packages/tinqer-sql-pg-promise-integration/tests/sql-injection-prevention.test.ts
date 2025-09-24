/**
 * SQL injection prevention tests with real PostgreSQL
 * Verifies that user input is properly parameterized
 */

import { describe, it, before } from "mocha";
import { expect } from "chai";
import { from } from "@webpods/tinqer";
import { execute, executeSimple } from "@webpods/tinqer-sql-pg-promise";
import { setupExpandedTestDatabase, seedExpandedTestData } from "./expanded-test-setup.js";
import { db } from "./shared-db.js";
import { expandedDbContext as dbContext } from "./expanded-database-schema.js";

describe("PostgreSQL Integration - SQL Injection Prevention", () => {
  before(async () => {
    await setupExpandedTestDatabase(db);
    await seedExpandedTestData(db);
  });

  describe("Malicious string inputs", () => {
    it("should safely handle SQL injection attempts in string parameters", async () => {
      const maliciousInputs = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "admin'--",
        "' UNION SELECT * FROM users--",
        "'; DELETE FROM products WHERE '1'='1",
        "Robert'); DROP TABLE students;--",
      ];

      for (const maliciousInput of maliciousInputs) {
        const params = { searchTerm: maliciousInput };

        // This should safely parameterize the input, not execute the malicious SQL
        const results = await execute(
          db,
          (p) =>
            from(dbContext, "users")
              .where((u) => u.name === p.searchTerm)
              .select((u) => ({ id: u.id, name: u.name })),
          params,
        );

        // Should return empty array, not throw error or execute injection
        expect(results).to.be.an("array");
        expect(results.length).to.equal(0);
      }

      // Verify tables still exist (injection didn't succeed)
      const checkUsers = await executeSimple(db, () => from(dbContext, "users").count());
      expect(checkUsers).to.be.greaterThan(0);
    });

    it("should handle special characters in search patterns", async () => {
      const specialPatterns = [
        "test%",
        "test_",
        "test\\",
        "test'test",
        'test"test',
        "test`test",
        "test;test",
        "test/*comment*/test",
      ];

      for (const pattern of specialPatterns) {
        const params = { pattern };

        const results = await execute(
          db,
          (p) =>
            from(dbContext, "products")
              .where((pr) => pr.name.includes(p.pattern))
              .select((pr) => ({ name: pr.name })),
          params,
        );

        expect(results).to.be.an("array");
        // Special characters should be treated as literals, not SQL syntax
      }
    });
  });

  describe("Numeric injection attempts", () => {
    it("should safely handle numeric injection attempts", async () => {
      const maliciousNumbers = ["1 OR 1=1", "1; DROP TABLE users", "1 UNION SELECT * FROM users"];

      for (const maliciousInput of maliciousNumbers) {
        // Even though we expect a number, malicious string should be handled safely
        const params = { userId: maliciousInput as any };

        try {
          const results = await execute(
            db,
            (p) =>
              from(dbContext, "users")
                .where((u) => u.id === p.userId)
                .select((u) => ({ id: u.id })),
            params,
          );

          // Should either return empty or throw type error, not execute injection
          expect(results).to.be.an("array");
        } catch (error) {
          // Type error is acceptable - means injection was prevented
          expect(error).to.exist;
        }
      }
    });
  });

  describe("Boolean injection attempts", () => {
    it("should safely handle boolean injection attempts", async () => {
      const maliciousBooleans = ["true; DROP TABLE users", "false OR 1=1", "true' OR '1'='1"];

      for (const maliciousInput of maliciousBooleans) {
        const params = { isActive: maliciousInput as any };

        try {
          const results = await execute(
            db,
            (p) =>
              from(dbContext, "users")
                .where((u) => u.is_active === p.isActive)
                .select((u) => ({ id: u.id })),
            params,
          );

          expect(results).to.be.an("array");
        } catch (error) {
          // Type error is acceptable
          expect(error).to.exist;
        }
      }
    });
  });

  describe("Complex injection scenarios", () => {
    it("should handle injection in multiple parameters", async () => {
      const params = {
        name: "'; DROP TABLE users; --",
        email: "test@test.com' OR '1'='1",
        age: "25 OR 1=1",
      };

      const results = await execute(
        db,
        (p) =>
          from(dbContext, "users")
            .where((u) => u.name === p.name && u.email === p.email && u.age === parseInt(p.age))
            .select((u) => ({ id: u.id })),
        params,
      );

      expect(results).to.be.an("array");
      expect(results.length).to.equal(0);
    });

    it("should safely handle injection in LIKE patterns", async () => {
      const params = {
        pattern: "%' OR '1'='1",
      };

      const results = await execute(
        db,
        (p) =>
          from(dbContext, "products")
            .where((pr) => pr.name.startsWith(p.pattern))
            .select((pr) => ({ name: pr.name })),
        params,
      );

      expect(results).to.be.an("array");
      // Pattern should be treated literally
    });

    it("should handle injection attempts in ORDER BY", async () => {
      // Note: ORDER BY injection is harder since we don't allow dynamic column names
      // But we should still test that computed expressions are safe
      const params = {
        multiplier: "1; DROP TABLE users",
      };

      try {
        const results = await execute(
          db,
          (p) =>
            from(dbContext, "products")
              .orderBy((pr) => pr.price * (parseInt(p.multiplier) || 1))
              .take(5)
              .select((pr) => ({ name: pr.name })),
          params,
        );

        expect(results).to.be.an("array");
      } catch (error) {
        // Parse error is acceptable
        expect(error).to.exist;
      }
    });
  });

  describe("NULL and undefined injection", () => {
    it("should handle NULL injection attempts", async () => {
      const params = {
        value: "NULL; DROP TABLE users",
      };

      const results = await execute(
        db,
        (p) =>
          from(dbContext, "users")
            .where((u) => u.phone === p.value)
            .select((u) => ({ id: u.id })),
        params,
      );

      expect(results).to.be.an("array");
      // NULL string should be treated as literal string, not SQL NULL
    });
  });

  describe("Comment injection", () => {
    it("should handle SQL comment injection attempts", async () => {
      const commentInjections = [
        "test /* comment */ test",
        "test -- comment",
        "test # comment",
        "test /* ; DROP TABLE users */ test",
      ];

      for (const injection of commentInjections) {
        const params = { search: injection };

        const results = await execute(
          db,
          (p) =>
            from(dbContext, "products")
              .where((pr) => pr.name === p.search)
              .select((pr) => ({ name: pr.name })),
          params,
        );

        expect(results).to.be.an("array");
        // Comments should be part of the string literal, not parsed as SQL
      }
    });
  });

  describe("Hex and encoding injection", () => {
    it("should handle hex-encoded injection attempts", async () => {
      const hexInjections = [
        "0x27204F52202731273D2731", // Hex encoding of ' OR '1'='1
        String.fromCharCode(0x27, 0x3b, 0x20, 0x44, 0x52, 0x4f, 0x50), // '; DROP
      ];

      for (const injection of hexInjections) {
        const params = { input: injection };

        const results = await execute(
          db,
          (p) =>
            from(dbContext, "users")
              .where((u) => u.name === p.input)
              .select((u) => ({ name: u.name })),
          params,
        );

        expect(results).to.be.an("array");
        expect(results.length).to.equal(0);
      }
    });
  });

  describe("Verification of parameterization", () => {
    it("should use parameterized queries for all user inputs", async () => {
      // Test that legitimate special characters work correctly when parameterized

      // First, insert a test user with special characters
      await db.none(
        "INSERT INTO users (name, email, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) ON CONFLICT DO NOTHING",
        ["O'Connor", "oconnor@test.com"],
      );

      const params = { name: "O'Connor" };

      const results = await execute(
        db,
        (p) =>
          from(dbContext, "users")
            .where((u) => u.name === p.name)
            .select((u) => ({ name: u.name })),
        params,
      );

      expect(results).to.be.an("array");
      // Should find the user with apostrophe in name
      const found = results.find((u) => u.name === "O'Connor");
      expect(found).to.exist;
    });
  });
});
