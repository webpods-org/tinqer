/**
 * Date/Time operations integration tests with real PostgreSQL
 */

import { describe, it, before } from "mocha";
import { expect } from "chai";
import { from } from "@webpods/tinqer";
import { execute, executeSimple } from "@webpods/tinqer-sql-pg-promise";
import { setupExpandedTestDatabase, seedExpandedTestData } from "./expanded-test-setup.js";
import { db } from "./shared-db.js";
import { expandedDbContext as dbContext } from "./expanded-database-schema.js";

describe("PostgreSQL Integration - Date/Time Operations", () => {
  before(async () => {
    await setupExpandedTestDatabase(db);
    await seedExpandedTestData(db);
  });

  describe("Date comparisons", () => {
    it("should filter orders by date range", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "orders")
          .where(
            (o) => o.order_date >= new Date("2024-01-01") && o.order_date < new Date("2024-07-01"),
          )
          .orderBy((o) => o.order_date),
      );

      expect(results).to.be.an("array");
      results.forEach((order) => {
        const orderDate = new Date(order.order_date);
        expect(orderDate.getTime()).to.be.at.least(new Date("2024-01-01").getTime());
        expect(orderDate.getTime()).to.be.lessThan(new Date("2024-07-01").getTime());
      });
    });

    it("should find orders from last 30 days using parameters", async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const params = {
        startDate: thirtyDaysAgo,
        endDate: new Date(),
      };

      const results = await execute(
        db,
        (p) =>
          from(dbContext, "orders")
            .where((o) => o.order_date >= p.startDate && o.order_date <= p.endDate)
            .select((o) => ({
              orderNumber: o.order_number,
              orderDate: o.order_date,
              status: o.status,
            })),
        params,
      );

      expect(results).to.be.an("array");
      results.forEach((order) => {
        const orderDate = new Date(order.orderDate);
        expect(orderDate.getTime()).to.be.at.least(params.startDate.getTime());
        expect(orderDate.getTime()).to.be.at.most(params.endDate.getTime());
      });
    });

    it("should compare dates with NULL handling", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "orders")
          .where((o) => o.ship_date !== null && o.ship_date > o.order_date)
          .select((o) => ({
            orderNumber: o.order_number,
            orderDate: o.order_date,
            shipDate: o.ship_date,
            daysToShip:
              o.ship_date !== null
                ? (o.ship_date.getTime() - o.order_date.getTime()) / (1000 * 60 * 60 * 24)
                : null,
          }))
          .take(20),
      );

      expect(results).to.be.an("array");
      results.forEach((order) => {
        if (order.shipDate !== null) {
          expect(new Date(order.shipDate).getTime()).to.be.greaterThan(
            new Date(order.orderDate).getTime(),
          );
        }
      });
    });
  });

  describe("Date ordering and grouping", () => {
    it("should order by multiple date columns", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "orders")
          .orderBy((o) => o.order_date)
          .thenByDescending((o) => o.ship_date ?? new Date("1900-01-01"))
          .take(20),
      );

      expect(results).to.be.an("array");
      expect(results.length).to.be.lessThanOrEqual(20);

      // Verify ordering
      for (let i = 1; i < results.length; i++) {
        const prevDate = new Date(results[i - 1]!.order_date).getTime();
        const currDate = new Date(results[i]!.order_date).getTime();
        expect(prevDate).to.be.lessThanOrEqual(currDate);
      }
    });

    it("should group orders by year and month", async () => {
      // Note: This is a simplified version since we can't use date extraction functions
      // In real scenario, you'd need DATE_TRUNC or EXTRACT functions
      const results = await executeSimple(db, () =>
        from(dbContext, "orders")
          .where((o) => o.order_date >= new Date("2024-01-01"))
          .groupBy(() => ({
            year: 2024, // Simplified - would need EXTRACT(YEAR FROM order_date)
            month: 1, // Simplified - would need EXTRACT(MONTH FROM order_date)
          }))
          .select((g) => ({
            year: g.key.year,
            month: g.key.month,
            orderCount: g.count(),
            totalRevenue: g.sum((o) => o.total_amount),
          })),
      );

      expect(results).to.be.an("array");
      results.forEach((group) => {
        expect(group.orderCount).to.be.greaterThan(0);
        expect(group.totalRevenue).to.be.greaterThan(0);
      });
    });
  });

  describe("Date-based calculations", () => {
    it("should calculate age/duration between dates", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "employees")
          .where((e) => e.hire_date !== null)
          .select((e) => ({
            name: e.first_name,
            hireDate: e.hire_date,
            // Simplified tenure calculation - days since hire
            tenureDays: (new Date().getTime() - e.hire_date.getTime()) / (1000 * 60 * 60 * 24),
          }))
          .take(10),
      );

      expect(results).to.be.an("array");
      results.forEach((emp) => {
        expect(emp.tenureDays).to.be.a("number");
        expect(emp.tenureDays).to.be.greaterThan(0);
      });
    });

    it("should find records within date ranges", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "projects")
          .where(
            (p) =>
              p.start_date !== null &&
              p.end_date !== null &&
              p.start_date <= new Date() &&
              p.end_date >= new Date(),
          )
          .select((p) => ({
            code: p.code,
            name: p.name,
            status: p.status,
            startDate: p.start_date,
            endDate: p.end_date,
          })),
      );

      expect(results).to.be.an("array");
      // All results should be "active" projects (current date between start and end)
      const now = new Date().getTime();
      results.forEach((project) => {
        if (project.startDate && project.endDate) {
          expect(new Date(project.startDate).getTime()).to.be.lessThanOrEqual(now);
          expect(new Date(project.endDate).getTime()).to.be.greaterThanOrEqual(now);
        }
      });
    });
  });

  describe("Timestamp operations", () => {
    it("should filter by created_at timestamps", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .orderByDescending((u) => u.created_at)
          .take(5)
          .select((u) => ({
            id: u.id,
            name: u.name,
            createdAt: u.created_at,
          })),
      );

      expect(results).to.be.an("array");
      expect(results.length).to.be.lessThanOrEqual(5);

      // Verify descending order
      for (let i = 1; i < results.length; i++) {
        const prevTime = new Date(results[i - 1]!.createdAt).getTime();
        const currTime = new Date(results[i]!.createdAt).getTime();
        expect(prevTime).to.be.greaterThanOrEqual(currTime);
      }
    });

    it("should find recently updated records", async () => {
      // Find records updated in the last year
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.updated_at > oneYearAgo)
          .select((p) => ({
            id: p.id,
            name: p.name,
            updatedAt: p.updated_at,
          }))
          .orderByDescending((p) => p.updatedAt)
          .take(10),
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(new Date(product.updatedAt).getTime()).to.be.greaterThan(oneYearAgo.getTime());
      });
    });
  });

  describe("Date edge cases", () => {
    it("should handle NULL date values", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "orders")
          .where((o) => o.delivery_date === null)
          .select((o) => ({
            orderNumber: o.order_number,
            status: o.status,
            deliveryDate: o.delivery_date,
          }))
          .take(10),
      );

      expect(results).to.be.an("array");
      results.forEach((order) => {
        expect(order.deliveryDate).to.be.null;
      });
    });

    it("should handle date comparisons with coalescing", async () => {
      const defaultDate = new Date("2024-12-31");

      const results = await executeSimple(db, () =>
        from(dbContext, "orders")
          .where((o) => (o.ship_date ?? defaultDate) < defaultDate)
          .select((o) => ({
            orderNumber: o.order_number,
            shipDate: o.ship_date,
            effectiveShipDate: o.ship_date ?? defaultDate,
          }))
          .take(10),
      );

      expect(results).to.be.an("array");
      results.forEach((order) => {
        const effectiveDate = order.shipDate ? new Date(order.shipDate) : defaultDate;
        expect(effectiveDate.getTime()).to.be.lessThanOrEqual(defaultDate.getTime());
      });
    });
  });
});
