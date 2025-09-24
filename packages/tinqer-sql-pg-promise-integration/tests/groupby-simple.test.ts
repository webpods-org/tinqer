/**
 * Simple GROUP BY integration tests with real PostgreSQL
 */

import { describe, it, before } from "mocha";
import { expect } from "chai";
import { from } from "@webpods/tinqer";
import { execute, executeSimple } from "@webpods/tinqer-sql-pg-promise";
import { setupExpandedTestDatabase, seedExpandedTestData } from "./expanded-test-setup.js";
import { db } from "./shared-db.js";
import { expandedDbContext as dbContext } from "./expanded-database-schema.js";

describe("PostgreSQL Integration - Simple GROUP BY", () => {
  before(async () => {
    await setupExpandedTestDatabase(db);
    await seedExpandedTestData(db);
  });

  describe("Basic grouping operations", () => {
    it("should group by single column", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .groupBy((u) => u.department_id)
          .select((g) => ({
            departmentId: g.key,
            userCount: g.count()
          }))
      );

      expect(results).to.be.an("array");
      results.forEach((group) => {
        expect(group).to.have.property("departmentId");
        expect(group.userCount).to.be.greaterThan(0);
      });
    });

    it("should group by string column", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "orders")
          .groupBy((o) => o.status)
          .select((g) => ({
            status: g.key,
            count: g.count()
          }))
          .orderBy((r) => r.status)
      );

      expect(results).to.be.an("array");
      const statuses = results.map(r => r.status);
      expect(statuses).to.include.members(["pending", "processing", "shipped", "completed"]);
    });

    it("should group by boolean column", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .groupBy((u) => u.is_active)
          .select((g) => ({
            isActive: g.key,
            count: g.count()
          }))
      );

      expect(results).to.be.an("array");
      expect(results.length).to.be.lessThanOrEqual(2); // true and false
      results.forEach((group) => {
        expect(group.isActive).to.be.a("boolean");
        expect(group.count).to.be.greaterThan(0);
      });
    });

    it("should group by nullable column", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .groupBy((p) => p.category_id)
          .select((g) => ({
            categoryId: g.key,
            productCount: g.count()
          }))
          .orderBy((r) => r.categoryId ?? 999999)
      );

      expect(results).to.be.an("array");
      // Should include NULL category group
      const nullGroup = results.find(r => r.categoryId === null);
      if (nullGroup) {
        expect(nullGroup.productCount).to.be.greaterThan(0);
      }
    });
  });

  describe("GROUP BY with WHERE", () => {
    it("should filter before grouping", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.price > 100)
          .groupBy((p) => p.category_id)
          .select((g) => ({
            category: g.key,
            expensiveProducts: g.count()
          }))
      );

      expect(results).to.be.an("array");
      results.forEach((group) => {
        expect(group.expensiveProducts).to.be.greaterThan(0);
      });
    });

    it("should handle multiple WHERE conditions with GROUP BY", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "orders")
          .where((o) => o.total_amount > 100)
          .where((o) => o.status !== "cancelled")
          .groupBy((o) => o.user_id)
          .select((g) => ({
            customerId: g.key,
            orderCount: g.count(),
            totalSpent: g.sum((o) => o.total_amount)
          }))
      );

      expect(results).to.be.an("array");
      results.forEach((group) => {
        expect(group.totalSpent).to.be.greaterThan(100);
      });
    });
  });

  describe("Aggregate functions", () => {
    it("should use COUNT aggregate", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "orders")
          .groupBy((o) => o.user_id)
          .select((g) => ({
            userId: g.key,
            orderCount: g.count()
          }))
          .orderByDescending((r) => r.orderCount)
          .take(5)
      );

      expect(results).to.be.an("array");
      expect(results.length).to.be.lessThanOrEqual(5);
      // Verify descending order
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.orderCount).to.be.greaterThanOrEqual(results[i]!.orderCount);
      }
    });

    it("should use SUM aggregate", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "order_items")
          .groupBy((oi) => oi.order_id)
          .select((g) => ({
            orderId: g.key,
            itemCount: g.count(),
            totalQuantity: g.sum((oi) => oi.quantity),
            totalAmount: g.sum((oi) => oi.quantity * oi.unit_price)
          }))
          .take(10)
      );

      expect(results).to.be.an("array");
      results.forEach((group) => {
        expect(group.totalQuantity).to.be.greaterThan(0);
        expect(group.totalAmount).to.be.greaterThan(0);
      });
    });

    it("should use AVERAGE aggregate", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.category_id !== null)
          .groupBy((p) => p.category_id)
          .select((g) => ({
            categoryId: g.key,
            avgPrice: g.average((p) => p.price),
            avgStock: g.average((p) => p.stock)
          }))
      );

      expect(results).to.be.an("array");
      results.forEach((group) => {
        expect(group.avgPrice).to.be.a("number");
        expect(group.avgStock).to.be.a("number");
      });
    });

    it("should use MIN and MAX aggregates", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "employees")
          .where((e) => e.department_id !== null && e.salary !== null)
          .groupBy((e) => e.department_id)
          .select((g) => ({
            deptId: g.key,
            minSalary: g.min((e) => e.salary!),
            maxSalary: g.max((e) => e.salary!),
            salaryRange: g.max((e) => e.salary!) - g.min((e) => e.salary!)
          }))
      );

      expect(results).to.be.an("array");
      results.forEach((group) => {
        expect(group.minSalary).to.be.lessThanOrEqual(group.maxSalary);
        expect(group.salaryRange).to.be.greaterThanOrEqual(0);
      });
    });

    it("should combine multiple aggregates", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "orders")
          .groupBy((o) => o.status)
          .select((g) => ({
            status: g.key,
            count: g.count(),
            totalRevenue: g.sum((o) => o.total_amount),
            avgOrderValue: g.average((o) => o.total_amount),
            minOrder: g.min((o) => o.total_amount),
            maxOrder: g.max((o) => o.total_amount),
            totalTax: g.sum((o) => o.tax_amount),
            totalShipping: g.sum((o) => o.shipping_amount)
          }))
      );

      expect(results).to.be.an("array");
      results.forEach((group) => {
        expect(group.count).to.be.greaterThan(0);
        expect(group.minOrder).to.be.lessThanOrEqual(group.maxOrder);
        expect(group.avgOrderValue).to.be.greaterThan(0);
      });
    });
  });

  describe("GROUP BY with ORDER BY", () => {
    it("should order by group key", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .groupBy((u) => u.country_id)
          .select((g) => ({
            countryId: g.key,
            userCount: g.count()
          }))
          .orderBy((r) => r.countryId ?? 999999)
      );

      expect(results).to.be.an("array");
      // Verify ordering by country ID
      for (let i = 1; i < results.length; i++) {
        const prev = results[i - 1]!.countryId ?? 999999;
        const curr = results[i]!.countryId ?? 999999;
        expect(prev).to.be.lessThanOrEqual(curr);
      }
    });

    it("should order by aggregate value", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .groupBy((p) => p.category_id)
          .select((g) => ({
            category: g.key,
            productCount: g.count(),
            totalStock: g.sum((p) => p.stock)
          }))
          .orderByDescending((r) => r.totalStock)
          .take(5)
      );

      expect(results).to.be.an("array");
      expect(results.length).to.be.lessThanOrEqual(5);
      // Verify descending order by total stock
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.totalStock).to.be.greaterThanOrEqual(results[i]!.totalStock);
      }
    });
  });

  describe("GROUP BY with DISTINCT", () => {
    it("should combine GROUP BY with DISTINCT", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "orders")
          .groupBy((o) => o.user_id)
          .select((g) => ({
            customerId: g.key
          }))
          .distinct()
      );

      expect(results).to.be.an("array");
      // Check uniqueness
      const customerIds = results.map(r => r.customerId);
      const uniqueIds = [...new Set(customerIds)];
      expect(customerIds.length).to.equal(uniqueIds.length);
    });
  });

  describe("GROUP BY with parameters", () => {
    it("should use parameters in WHERE before GROUP BY", async () => {
      const params = {
        minPrice: 100,
        maxPrice: 1000
      };

      const results = await execute(
        db,
        (p) => from(dbContext, "products")
          .where((pr) => pr.price >= p.minPrice && pr.price <= p.maxPrice)
          .groupBy((pr) => pr.category_id)
          .select((g) => ({
            category: g.key,
            count: g.count(),
            avgPrice: g.average((pr) => pr.price)
          })),
        params
      );

      expect(results).to.be.an("array");
      results.forEach((group) => {
        expect(group.avgPrice).to.be.at.least(params.minPrice);
        expect(group.avgPrice).to.be.at.most(params.maxPrice);
      });
    });
  });

  describe("NULL handling in GROUP BY", () => {
    it("should handle NULL values in grouping column", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .groupBy((u) => u.department_id)
          .select((g) => ({
            dept: g.key,
            count: g.count()
          }))
      );

      expect(results).to.be.an("array");
      // Should have a group for NULL department
      const nullGroup = results.find(g => g.dept === null);
      if (nullGroup) {
        expect(nullGroup.count).to.be.greaterThan(0);
      }
    });

    it("should handle NULL in aggregated values", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .groupBy((u) => u.department_id)
          .select((g) => ({
            dept: g.key,
            avgSalary: g.average((u) => u.salary ?? 0),
            countWithSalary: g.count((u) => u.salary !== null)
          }))
      );

      expect(results).to.be.an("array");
      results.forEach((group) => {
        expect(group.avgSalary).to.be.a("number");
        expect(group.countWithSalary).to.be.a("number");
      });
    });
  });
});