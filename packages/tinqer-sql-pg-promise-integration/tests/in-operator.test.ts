/**
 * IN operator integration tests with real PostgreSQL
 */

import { describe, it, before } from "mocha";
import { expect } from "chai";
import { from } from "@webpods/tinqer";
import { execute, executeSimple } from "@webpods/tinqer-sql-pg-promise";
import { setupExpandedTestDatabase, seedExpandedTestData } from "./expanded-test-setup.js";
import { db } from "./shared-db.js";
import { expandedDbContext as dbContext } from "./expanded-database-schema.js";

describe("PostgreSQL Integration - IN Operator", () => {
  before(async () => {
    await setupExpandedTestDatabase(db);
    await seedExpandedTestData(db);
  });

  describe("Basic IN operations", () => {
    it("should filter users with department_id IN specific values", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users").where((u) => [1, 2, 3].includes(u.department_id!)),
      );

      expect(results).to.be.an("array");
      expect(results.length).to.be.greaterThan(0);
      results.forEach((user) => {
        expect([1, 2, 3]).to.include(user.department_id);
      });
    });

    it("should filter products by category_id IN array", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products").where((p) => [1, 3, 5].includes(p.category_id!)),
      );

      expect(results).to.be.an("array");
      expect(results.length).to.be.greaterThan(0);
      results.forEach((product) => {
        expect([1, 3, 5]).to.include(product.category_id);
      });
    });

    it("should handle single value IN array", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "departments").where((d) => [1].includes(d.company_id)),
      );

      expect(results).to.be.an("array");
      results.forEach((dept) => {
        expect(dept.company_id).to.equal(1);
      });
    });

    it("should handle empty array as FALSE (return no results)", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users").where((u) => ([] as number[]).includes(u.id)),
      );

      expect(results).to.be.an("array");
      expect(results.length).to.equal(0);
    });

    it("should filter with string values IN array", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "orders").where((o) => ["pending", "processing"].includes(o.status)),
      );

      expect(results).to.be.an("array");
      expect(results.length).to.be.greaterThan(0);
      results.forEach((order) => {
        expect(["pending", "processing"]).to.include(order.status);
      });
    });
  });

  describe("NOT IN operations", () => {
    it("should filter users NOT IN departments using negation", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users").where((u) => ![1, 2].includes(u.department_id!)),
      );

      expect(results).to.be.an("array");
      results.forEach((user) => {
        if (user.department_id !== null) {
          expect([1, 2]).to.not.include(user.department_id);
        }
      });
    });

    it("should handle negated empty array as TRUE (return all)", async () => {
      const allUsers = await executeSimple(db, () => from(dbContext, "users"));

      const results = await executeSimple(db, () =>
        from(dbContext, "users").where((u) => !([] as number[]).includes(u.id)),
      );

      expect(results.length).to.equal(allUsers.length);
    });
  });

  describe("IN with other conditions", () => {
    it("should combine IN with AND conditions", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products").where(
          (p) => [1, 2, 3].includes(p.category_id!) && p.price > 100,
        ),
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect([1, 2, 3]).to.include(product.category_id);
        expect(product.price).to.be.greaterThan(100);
      });
    });

    it("should combine IN with OR conditions", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users").where(
          (u) => [1, 2].includes(u.department_id!) || u.is_active === false,
        ),
      );

      expect(results).to.be.an("array");
      expect(results.length).to.be.greaterThan(0);
      results.forEach((user) => {
        const inDepartment = user.department_id !== null && [1, 2].includes(user.department_id);
        const isInactive = user.is_active === false;
        expect(inDepartment || isInactive).to.be.true;
      });
    });

    it("should handle multiple IN conditions", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users").where(
          (u) => [1, 3, 5].includes(u.department_id!) && [1, 2].includes(u.country_id!),
        ),
      );

      expect(results).to.be.an("array");
      results.forEach((user) => {
        expect([1, 3, 5]).to.include(user.department_id);
        expect([1, 2]).to.include(user.country_id);
      });
    });
  });

  describe("IN with parameters", () => {
    it("should use IN with parameterized values", async () => {
      const params = {
        deptIds: [2, 4, 6],
        minSalary: 50000,
      };

      const results = await execute(
        db,
        (p) =>
          from(dbContext, "users").where(
            (u) => p.deptIds.includes(u.department_id!) && (u.salary ?? 0) >= p.minSalary,
          ),
        params,
      );

      expect(results).to.be.an("array");
      results.forEach((user) => {
        expect(params.deptIds).to.include(user.department_id);
        expect(user.salary ?? 0).to.be.at.least(params.minSalary);
      });
    });

    it("should mix IN arrays with other parameters", async () => {
      const params = {
        searchTerm: "Pro",
        maxPrice: 1000,
      };

      const results = await execute(
        db,
        (p) =>
          from(dbContext, "products").where(
            (pr) =>
              [1, 2, 3, 4].includes(pr.category_id!) &&
              pr.name.includes(p.searchTerm) &&
              pr.price <= p.maxPrice,
          ),
        params,
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect([1, 2, 3, 4]).to.include(product.category_id);
        expect(product.name).to.include(params.searchTerm);
        expect(product.price).to.be.at.most(params.maxPrice);
      });
    });
  });

  describe("IN with other SQL operations", () => {
    it("should work with IN, SELECT and ORDER BY", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => [1, 2, 3].includes(p.category_id!))
          .select((p) => ({
            id: p.id,
            name: p.name,
            price: p.price,
            category: p.category_id,
          }))
          .orderBy((p) => p.price)
          .take(5),
      );

      expect(results).to.be.an("array");
      expect(results.length).to.be.lessThanOrEqual(5);

      // Check ordering
      for (let i = 1; i < results.length; i++) {
        expect(results[i]!.price).to.be.at.least(results[i - 1]!.price);
      }

      results.forEach((product) => {
        expect([1, 2, 3]).to.include(product.category);
      });
    });

    it("should work with IN and GROUP BY", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "orders")
          .where((o) => ["completed", "shipped"].includes(o.status))
          .groupBy((o) => ({ status: o.status }))
          .select((g) => ({
            status: g.key.status,
            count: g.count(),
            totalRevenue: g.sum((o) => o.total_amount),
          })),
      );

      expect(results).to.be.an("array");
      expect(results.length).to.be.lessThanOrEqual(2);
      results.forEach((group) => {
        expect(["completed", "shipped"]).to.include(group.status);
        expect(group.count).to.be.greaterThan(0);
        expect(group.totalRevenue).to.be.greaterThan(0);
      });
    });

    it("should work with IN and pagination", async () => {
      const page1 = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => [1, 2, 3, 4, 5].includes(p.category_id!))
          .orderBy((p) => p.id)
          .skip(0)
          .take(3),
      );

      const page2 = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => [1, 2, 3, 4, 5].includes(p.category_id!))
          .orderBy((p) => p.id)
          .skip(3)
          .take(3),
      );

      expect(page1.length).to.be.lessThanOrEqual(3);
      expect(page2.length).to.be.lessThanOrEqual(3);

      // Ensure no overlap between pages
      const page1Ids = page1.map((p) => p.id);
      const page2Ids = page2.map((p) => p.id);
      expect(page1Ids.filter((id) => page2Ids.includes(id))).to.be.empty;
    });

    it("should work with IN and DISTINCT", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => [1, 2, 3].includes(p.category_id!))
          .select((p) => ({ categoryId: p.category_id }))
          .distinct(),
      );

      expect(results).to.be.an("array");
      expect(results.length).to.be.lessThanOrEqual(3);

      // Check for uniqueness
      const categoryIds = results.map((r) => r.categoryId);
      const uniqueCategoryIds = [...new Set(categoryIds)];
      expect(categoryIds.length).to.equal(uniqueCategoryIds.length);
    });

    it("should work with IN and JOIN", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .where((u) => [1, 2, 3].includes(u.department_id!))
          .join(
            from(dbContext, "departments"),
            (u) => u.department_id,
            (d) => d.id,
            (u, d) => ({
              userName: u.name,
              departmentName: d.name,
              departmentId: d.id,
            }),
          ),
      );

      expect(results).to.be.an("array");
      expect(results.length).to.be.greaterThan(0);
      results.forEach((row) => {
        expect([1, 2, 3]).to.include(row.departmentId);
        expect(row).to.have.property("userName");
        expect(row).to.have.property("departmentName");
      });
    });
  });
});
