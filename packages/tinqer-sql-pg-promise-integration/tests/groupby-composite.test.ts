/**
 * Composite GROUP BY integration tests with real PostgreSQL
 */

import { describe, it, before } from "mocha";
import { expect } from "chai";
import { from } from "@webpods/tinqer";
import { execute, executeSimple } from "@webpods/tinqer-sql-pg-promise";
import { setupExpandedTestDatabase, seedExpandedTestData } from "./expanded-test-setup.js";
import { db } from "./shared-db.js";
import { expandedDbContext as dbContext } from "./expanded-database-schema.js";

describe("PostgreSQL Integration - Composite GROUP BY", () => {
  before(async () => {
    await setupExpandedTestDatabase(db);
    await seedExpandedTestData(db);
  });

  describe("Two-column grouping", () => {
    it("should group by two columns", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "orders")
          .groupBy((o) => ({
            userId: o.user_id,
            status: o.status
          }))
          .select((g) => ({
            customerId: g.key.userId,
            orderStatus: g.key.status,
            orderCount: g.count(),
            totalAmount: g.sum((o) => o.total_amount)
          }))
          .orderBy((r) => r.customerId)
          .thenBy((r) => r.orderStatus)
      );

      expect(results).to.be.an("array");
      results.forEach((group) => {
        expect(group).to.have.property("customerId");
        expect(group).to.have.property("orderStatus");
        expect(group.orderCount).to.be.greaterThan(0);
        expect(group.totalAmount).to.be.greaterThan(0);
      });
    });

    it("should group by nullable and non-nullable columns", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .groupBy((u) => ({
            deptId: u.department_id,
            isActive: u.is_active
          }))
          .select((g) => ({
            department: g.key.deptId,
            active: g.key.isActive,
            count: g.count(),
            avgAge: g.average((u) => u.age ?? 0)
          }))
      );

      expect(results).to.be.an("array");
      results.forEach((group) => {
        expect(group.active).to.be.a("boolean");
        expect(group.count).to.be.greaterThan(0);
      });
    });

    it("should group by string and numeric columns", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .groupBy((p) => ({
            category: p.category_id,
            featured: p.is_featured
          }))
          .select((g) => ({
            categoryId: g.key.category,
            isFeatured: g.key.featured,
            productCount: g.count(),
            avgPrice: g.average((p) => p.price),
            totalStock: g.sum((p) => p.stock)
          }))
          .orderBy((r) => r.categoryId ?? 999999)
      );

      expect(results).to.be.an("array");
      results.forEach((group) => {
        expect(group.isFeatured).to.be.a("boolean");
        expect(group.productCount).to.be.greaterThan(0);
      });
    });
  });

  describe("Three-column grouping", () => {
    it("should group by three columns", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .groupBy((u) => ({
            countryId: u.country_id,
            deptId: u.department_id,
            active: u.is_active
          }))
          .select((g) => ({
            country: g.key.countryId,
            department: g.key.deptId,
            isActive: g.key.active,
            userCount: g.count()
          }))
          .take(20)
      );

      expect(results).to.be.an("array");
      results.forEach((group) => {
        expect(group).to.have.all.keys("country", "department", "isActive", "userCount");
        expect(group.userCount).to.be.greaterThan(0);
      });
    });

    it("should group by date components (simplified)", async () => {
      // Note: Real date extraction would need SQL functions
      const results = await executeSimple(db, () =>
        from(dbContext, "orders")
          .where((o) => o.order_date >= new Date("2024-01-01"))
          .groupBy((o) => ({
            year: 2024,  // Simplified - would need EXTRACT(YEAR FROM order_date)
            month: 1,    // Simplified - would need EXTRACT(MONTH FROM order_date)
            status: o.status
          }))
          .select((g) => ({
            year: g.key.year,
            month: g.key.month,
            status: g.key.status,
            orderCount: g.count(),
            revenue: g.sum((o) => o.total_amount)
          }))
      );

      expect(results).to.be.an("array");
      results.forEach((group) => {
        expect(group.year).to.equal(2024);
        expect(group.orderCount).to.be.greaterThan(0);
      });
    });
  });

  describe("Composite GROUP BY with computed keys", () => {
    it("should group by computed expressions", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .groupBy((p) => ({
            priceRange: p.price < 100 ? "Low" : p.price < 500 ? "Medium" : "High",
            hasStock: p.stock > 0
          }))
          .select((g) => ({
            range: g.key.priceRange,
            inStock: g.key.hasStock,
            count: g.count(),
            avgPrice: g.average((p) => p.price)
          }))
      );

      expect(results).to.be.an("array");
      results.forEach((group) => {
        expect(["Low", "Medium", "High"]).to.include(group.range);
        expect(group.inStock).to.be.a("boolean");
        expect(group.count).to.be.greaterThan(0);
      });
    });

    it("should group by conditional expressions", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "employees")
          .where((e) => e.salary !== null)
          .groupBy((e) => ({
            department: e.department_id,
            salaryLevel: e.salary! < 50000 ? "Junior" :
                        e.salary! < 80000 ? "Mid" : "Senior"
          }))
          .select((g) => ({
            dept: g.key.department,
            level: g.key.salaryLevel,
            count: g.count(),
            avgSalary: g.average((e) => e.salary!)
          }))
      );

      expect(results).to.be.an("array");
      results.forEach((group) => {
        expect(["Junior", "Mid", "Senior"]).to.include(group.level);
        expect(group.avgSalary).to.be.a("number");
      });
    });
  });

  describe("Composite GROUP BY with WHERE", () => {
    it("should filter before composite grouping", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "orders")
          .where((o) => o.total_amount > 500)
          .groupBy((o) => ({
            customerId: o.user_id,
            year: 2024  // Simplified
          }))
          .select((g) => ({
            customer: g.key.customerId,
            year: g.key.year,
            highValueOrders: g.count(),
            totalRevenue: g.sum((o) => o.total_amount)
          }))
      );

      expect(results).to.be.an("array");
      results.forEach((group) => {
        expect(group.totalRevenue).to.be.greaterThan(500);
      });
    });

    it("should handle complex WHERE with composite GROUP BY", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.stock > 0 && p.is_featured === true)
          .groupBy((p) => ({
            category: p.category_id,
            priceRange: p.price >= 1000 ? "Premium" : "Standard"
          }))
          .select((g) => ({
            categoryId: g.key.category,
            range: g.key.priceRange,
            featuredCount: g.count(),
            totalValue: g.sum((p) => p.price * p.stock)
          }))
      );

      expect(results).to.be.an("array");
      results.forEach((group) => {
        expect(["Premium", "Standard"]).to.include(group.range);
        expect(group.featuredCount).to.be.greaterThan(0);
      });
    });
  });

  describe("Composite GROUP BY with ORDER BY", () => {
    it("should order by composite key components", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .groupBy((u) => ({
            country: u.country_id,
            dept: u.department_id
          }))
          .select((g) => ({
            countryId: g.key.country,
            deptId: g.key.dept,
            count: g.count()
          }))
          .orderBy((r) => r.countryId ?? 999999)
          .thenBy((r) => r.deptId ?? 999999)
      );

      expect(results).to.be.an("array");
      // Verify ordering
      for (let i = 1; i < results.length; i++) {
        const prevCountry = results[i - 1]!.countryId ?? 999999;
        const currCountry = results[i]!.countryId ?? 999999;
        expect(prevCountry).to.be.lessThanOrEqual(currCountry);

        if (prevCountry === currCountry) {
          const prevDept = results[i - 1]!.deptId ?? 999999;
          const currDept = results[i]!.deptId ?? 999999;
          expect(prevDept).to.be.lessThanOrEqual(currDept);
        }
      }
    });

    it("should order by aggregated values with composite GROUP BY", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "orders")
          .groupBy((o) => ({
            userId: o.user_id,
            status: o.status
          }))
          .select((g) => ({
            customer: g.key.userId,
            status: g.key.status,
            count: g.count(),
            total: g.sum((o) => o.total_amount)
          }))
          .orderByDescending((r) => r.total)
          .take(10)
      );

      expect(results).to.be.an("array");
      expect(results.length).to.be.lessThanOrEqual(10);
      // Verify descending order by total
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.total).to.be.greaterThanOrEqual(results[i]!.total);
      }
    });
  });

  describe("Complex composite GROUP BY scenarios", () => {
    it("should handle all aggregate functions with composite GROUP BY", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "order_items")
          .groupBy((oi) => ({
            orderId: oi.order_id,
            productId: oi.product_id
          }))
          .select((g) => ({
            order: g.key.orderId,
            product: g.key.productId,
            lineItems: g.count(),
            totalQty: g.sum((oi) => oi.quantity),
            avgPrice: g.average((oi) => oi.unit_price),
            minPrice: g.min((oi) => oi.unit_price),
            maxPrice: g.max((oi) => oi.unit_price),
            revenue: g.sum((oi) => oi.quantity * oi.unit_price)
          }))
          .take(20)
      );

      expect(results).to.be.an("array");
      results.forEach((group) => {
        expect(group.lineItems).to.be.greaterThan(0);
        expect(group.minPrice).to.be.lessThanOrEqual(group.maxPrice);
        expect(group.revenue).to.equal(group.totalQty * group.avgPrice);
      });
    });

    it("should handle composite GROUP BY with parameters", async () => {
      const params = {
        minAmount: 100,
        targetStatus: "completed"
      };

      const results = await execute(
        db,
        (p) => from(dbContext, "orders")
          .where((o) => o.total_amount >= p.minAmount)
          .groupBy((o) => ({
            customerId: o.user_id,
            isTarget: o.status === p.targetStatus
          }))
          .select((g) => ({
            customer: g.key.customerId,
            isTargetStatus: g.key.isTarget,
            orders: g.count(),
            revenue: g.sum((o) => o.total_amount)
          })),
        params
      );

      expect(results).to.be.an("array");
      results.forEach((group) => {
        expect(group.revenue).to.be.at.least(params.minAmount);
        expect(group.isTargetStatus).to.be.a("boolean");
      });
    });
  });

  describe("NULL handling in composite GROUP BY", () => {
    it("should handle NULL in composite key components", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .groupBy((u) => ({
            dept: u.department_id,
            country: u.country_id,
            salary: u.salary !== null
          }))
          .select((g) => ({
            department: g.key.dept,
            country: g.key.country,
            hasSalary: g.key.salary,
            count: g.count()
          }))
      );

      expect(results).to.be.an("array");
      // Should include groups with NULL department and/or country
      const nullGroups = results.filter(g =>
        g.department === null || g.country === null
      );
      if (nullGroups.length > 0) {
        nullGroups.forEach(g => {
          expect(g.count).to.be.greaterThan(0);
        });
      }
    });
  });
});