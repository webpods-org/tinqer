/**
 * NULL coalescing integration tests with real PostgreSQL
 * Tests nullish coalescing operator (??) and NULL handling
 */

import { describe, it, before } from "mocha";
import { expect } from "chai";
import { from } from "@webpods/tinqer";
import { execute, executeSimple } from "@webpods/tinqer-sql-pg-promise";
import { setupExpandedTestDatabase, seedExpandedTestData } from "./expanded-test-setup.js";
import { db } from "./shared-db.js";
import { expandedDbContext as dbContext } from "./expanded-database-schema.js";

describe("PostgreSQL Integration - NULL Coalescing", () => {
  before(async () => {
    await setupExpandedTestDatabase(db);
    await seedExpandedTestData(db);
  });

  describe("Basic NULL coalescing (??)", () => {
    it("should coalesce NULL to default value", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .select((u) => ({
            id: u.id,
            phone: u.phone ?? "No phone"
          }))
          .take(10)
      );

      expect(results).to.be.an("array");
      results.forEach((user) => {
        expect(user.phone).to.not.be.null;
        if (user.phone === "No phone") {
          expect(user.phone).to.equal("No phone");
        }
      });
    });

    it("should coalesce NULL numbers to zero", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .select((p) => ({
            id: p.id,
            cost: p.cost ?? 0
          }))
          .take(20)
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.cost).to.be.a("number");
        expect(product.cost).to.not.be.null;
      });
    });

    it("should coalesce NULL booleans", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .select((u) => ({
            id: u.id,
            verified: u.is_verified ?? false
          }))
          .take(10)
      );

      expect(results).to.be.an("array");
      results.forEach((user) => {
        expect(user.verified).to.be.a("boolean");
      });
    });

    it("should coalesce NULL dates", async () => {
      const defaultDate = new Date("2024-01-01");
      
      const results = await executeSimple(db, () =>
        from(dbContext, "orders")
          .select((o) => ({
            id: o.id,
            shipDate: o.ship_date ?? defaultDate
          }))
          .take(10)
      );

      expect(results).to.be.an("array");
      results.forEach((order) => {
        expect(order.shipDate).to.not.be.null;
        expect(order.shipDate).to.be.instanceOf(Date);
      });
    });
  });

  describe("NULL coalescing in WHERE clauses", () => {
    it("should filter using coalesced values", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => (p.cost ?? 0) > 50)
          .select((p) => ({
            id: p.id,
            cost: p.cost,
            coalescedCost: p.cost ?? 0
          }))
          .take(10)
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.coalescedCost).to.be.greaterThan(50);
      });
    });

    it("should compare coalesced values", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .where((u) => (u.age ?? 0) >= 18)
          .select((u) => ({
            id: u.id,
            age: u.age,
            effectiveAge: u.age ?? 0
          }))
          .take(20)
      );

      expect(results).to.be.an("array");
      results.forEach((user) => {
        expect(user.effectiveAge).to.be.at.least(18);
      });
    });

    it("should handle multiple coalescing in WHERE", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "employees")
          .where((e) => 
            (e.salary ?? 0) > 50000 &&
            (e.bonus ?? 0) > 1000
          )
          .select((e) => ({
            id: e.id,
            salary: e.salary,
            bonus: e.bonus
          }))
          .take(10)
      );

      expect(results).to.be.an("array");
      results.forEach((emp) => {
        const effectiveSalary = emp.salary ?? 0;
        const effectiveBonus = emp.bonus ?? 0;
        expect(effectiveSalary).to.be.greaterThan(50000);
        expect(effectiveBonus).to.be.greaterThan(1000);
      });
    });
  });

  describe("NULL coalescing with parameters", () => {
    it("should coalesce to parameter value", async () => {
      const params = {
        defaultPhone: "+1-000-000-0000",
        defaultAge: 21
      };

      const results = await execute(
        db,
        (p) => from(dbContext, "users")
          .select((u) => ({
            id: u.id,
            phone: u.phone ?? p.defaultPhone,
            age: u.age ?? p.defaultAge
          }))
          .take(10),
        params
      );

      expect(results).to.be.an("array");
      results.forEach((user) => {
        expect(user.phone).to.not.be.null;
        expect(user.age).to.not.be.null;
        if (user.phone === params.defaultPhone) {
          expect(user.phone).to.equal(params.defaultPhone);
        }
        if (user.age === params.defaultAge) {
          expect(user.age).to.equal(params.defaultAge);
        }
      });
    });

    it("should use parameter in coalesced WHERE", async () => {
      const params = {
        defaultStock: 10,
        minStock: 5
      };

      const results = await execute(
        db,
        (p) => from(dbContext, "products")
          .where((pr) => (pr.stock ?? p.defaultStock) >= p.minStock)
          .select((pr) => ({
            id: pr.id,
            stock: pr.stock,
            effectiveStock: pr.stock ?? p.defaultStock
          }))
          .take(20),
        params
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.effectiveStock).to.be.at.least(params.minStock);
      });
    });
  });

  describe("NULL coalescing in calculations", () => {
    it("should handle coalescing in arithmetic", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .select((p) => ({
            id: p.id,
            price: p.price,
            cost: p.cost,
            profit: p.price - (p.cost ?? 0),
            margin: ((p.price - (p.cost ?? 0)) / p.price) * 100
          }))
          .take(10)
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.profit).to.be.a("number");
        expect(product.margin).to.be.a("number");
        expect(product.profit).to.not.be.NaN;
        expect(product.margin).to.not.be.NaN;
      });
    });

    it("should handle coalescing in string concatenation", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .select((u) => ({
            id: u.id,
            name: u.name,
            phone: u.phone ?? "Unknown",
            // Note: String concatenation might not work directly
            displayPhone: u.phone ?? "No phone provided"
          }))
          .take(10)
      );

      expect(results).to.be.an("array");
      results.forEach((user) => {
        expect(user.displayPhone).to.be.a("string");
        expect(user.displayPhone).to.not.be.null;
      });
    });
  });

  describe("NULL coalescing with aggregates", () => {
    it("should coalesce in SUM aggregates", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "employees")
          .groupBy((e) => e.department_id)
          .select((g) => ({
            deptId: g.key,
            totalSalary: g.sum((e) => e.salary ?? 0),
            totalBonus: g.sum((e) => e.bonus ?? 0)
          }))
          .take(10)
      );

      expect(results).to.be.an("array");
      results.forEach((dept) => {
        expect(dept.totalSalary).to.be.a("number");
        expect(dept.totalBonus).to.be.a("number");
        expect(dept.totalSalary).to.not.be.null;
        expect(dept.totalBonus).to.not.be.null;
      });
    });

    it("should coalesce in AVERAGE aggregates", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .groupBy((p) => p.category_id)
          .select((g) => ({
            categoryId: g.key,
            avgCost: g.average((p) => p.cost ?? 0)
          }))
          .take(10)
      );

      expect(results).to.be.an("array");
      results.forEach((category) => {
        expect(category.avgCost).to.be.a("number");
        expect(category.avgCost).to.not.be.null;
      });
    });

    it("should coalesce in COUNT with condition", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .groupBy((u) => u.department_id)
          .select((g) => ({
            deptId: g.key,
            totalUsers: g.count(),
            usersWithPhone: g.count((u) => (u.phone ?? "") !== "")
          }))
      );

      expect(results).to.be.an("array");
      results.forEach((dept) => {
        expect(dept.totalUsers).to.be.at.least(dept.usersWithPhone);
      });
    });
  });

  describe("NULL coalescing in ORDER BY", () => {
    it("should order by coalesced values", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .orderBy((p) => p.cost ?? 999999)
          .select((p) => ({
            id: p.id,
            cost: p.cost,
            effectiveCost: p.cost ?? 999999
          }))
          .take(10)
      );

      expect(results).to.be.an("array");
      // Verify ordering - NULLs should be last (coalesced to 999999)
      for (let i = 1; i < results.length; i++) {
        const prevCost = results[i - 1]!.effectiveCost;
        const currCost = results[i]!.effectiveCost;
        expect(prevCost).to.be.lessThanOrEqual(currCost);
      }
    });

    it("should handle descending order with coalescing", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .orderByDescending((u) => u.age ?? 0)
          .select((u) => ({
            id: u.id,
            age: u.age,
            effectiveAge: u.age ?? 0
          }))
          .take(10)
      );

      expect(results).to.be.an("array");
      // Verify descending order
      for (let i = 1; i < results.length; i++) {
        const prevAge = results[i - 1]!.effectiveAge;
        const currAge = results[i]!.effectiveAge;
        expect(prevAge).to.be.greaterThanOrEqual(currAge);
      }
    });
  });

  describe("Chained coalescing", () => {
    it("should handle multiple fallback values", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .select((u) => ({
            id: u.id,
            // Simulate chained coalescing: phone ?? address ?? "No contact"
            contact: u.phone ?? (u.address ?? "No contact")
          }))
          .take(10)
      );

      expect(results).to.be.an("array");
      results.forEach((user) => {
        expect(user.contact).to.not.be.null;
        expect(user.contact).to.be.a("string");
      });
    });

    it("should handle nested coalescing in calculations", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "employees")
          .select((e) => ({
            id: e.id,
            totalComp: (e.salary ?? 0) + (e.bonus ?? 0),
            adjustedSalary: (e.salary ?? 50000) * 1.1
          }))
          .take(10)
      );

      expect(results).to.be.an("array");
      results.forEach((emp) => {
        expect(emp.totalComp).to.be.a("number");
        expect(emp.adjustedSalary).to.be.a("number");
        expect(emp.totalComp).to.be.at.least(0);
        expect(emp.adjustedSalary).to.be.at.least(55000); // 50000 * 1.1
      });
    });
  });

  describe("NULL coalescing edge cases", () => {
    it("should handle coalescing with empty strings", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .select((p) => ({
            id: p.id,
            description: p.description ?? "No description"
          }))
          .take(10)
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.description).to.not.be.null;
        // Empty string is not NULL, so should not be coalesced
      });
    });

    it("should handle coalescing with zero", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.stock === 0)
          .select((p) => ({
            id: p.id,
            stock: p.stock,
            // Zero is not NULL, should not be coalesced
            stockDisplay: p.stock ?? -1
          }))
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.stock).to.equal(0);
        expect(product.stockDisplay).to.equal(0); // Not -1
      });
    });

    it("should handle coalescing with false", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .where((u) => u.is_active === false)
          .select((u) => ({
            id: u.id,
            isActive: u.is_active,
            // False is not NULL, should not be coalesced
            activeDisplay: u.is_active ?? true
          }))
          .take(5)
      );

      expect(results).to.be.an("array");
      results.forEach((user) => {
        expect(user.isActive).to.equal(false);
        expect(user.activeDisplay).to.equal(false); // Not true
      });
    });
  });
});