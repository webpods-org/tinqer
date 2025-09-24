/**
 * Comprehensive expanded integration tests for PostgreSQL
 * This file covers all major query patterns with the expanded schema
 */

import { describe, it, before } from "mocha";
import { expect } from "chai";
import { from } from "@webpods/tinqer";
import { execute, executeSimple } from "@webpods/tinqer-sql-pg-promise";
import { expandedDbContext as dbContext } from "./expanded-database-schema.js";
import { setupExpandedTestDatabase, seedExpandedTestData } from "./expanded-test-setup.js";
import { db } from "./shared-db.js";

describe("Comprehensive Expanded Integration Tests", () => {
  before(async () => {
    await setupExpandedTestDatabase(db);
    await seedExpandedTestData(db);
  });

  describe("DISTINCT operations", () => {
    it("should get distinct department names", async () => {
      const result = await executeSimple(db, () =>
        from(dbContext, "departments")
          .select((d) => ({ department: d.name }))
          .distinct(),
      );

      const names = result.map((r) => r.department);
      const uniqueNames = [...new Set(names)];
      expect(names.length).to.equal(uniqueNames.length);
      expect(result.length).to.be.greaterThan(0);
    });

    it("should get distinct with WHERE and parameters", async () => {
      const result = await execute(
        db,
        (params) =>
          from(dbContext, "products")
            .where((p) => p.price >= params.minPrice && p.category_id !== null)
            .select((p) => ({ categoryId: p.category_id }))
            .distinct(),
        { minPrice: 500 },
      );

      expect(result.length).to.be.greaterThan(0);
      const categoryIds = result.map((r) => r.categoryId);
      const uniqueIds = [...new Set(categoryIds)];
      expect(categoryIds.length).to.equal(uniqueIds.length);
    });

    it("should distinct with ORDER BY and LIMIT", async () => {
      const result = await executeSimple(db, () =>
        from(dbContext, "categories")
          .select((c) => ({ name: c.name }))
          .distinct()
          .orderBy((c) => c.name)
          .take(5),
      );

      expect(result.length).to.be.lessThanOrEqual(5);
      const names = result.map((r) => r.name);
      const uniqueNames = [...new Set(names)];
      expect(names.length).to.equal(uniqueNames.length);
    });
  });

  describe("GROUP BY operations", () => {
    it("should count users by department", async () => {
      const result = await executeSimple(db, () =>
        from(dbContext, "users")
          .where((u) => u.department_id !== null)
          .groupBy((u) => ({ deptId: u.department_id }))
          .select((g) => ({
            departmentId: g.key.deptId,
            userCount: g.count(),
          })),
      );

      expect(result.length).to.be.greaterThan(0);
      result.forEach((r) => {
        expect(r.departmentId).to.be.a("number");
        expect(r.userCount).to.be.greaterThan(0);
      });
    });

    it("should calculate aggregate statistics", async () => {
      const result = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.category_id !== null)
          .groupBy((p) => ({ catId: p.category_id }))
          .select((g) => ({
            categoryId: g.key.catId,
            minPrice: g.min((p) => p.price),
            maxPrice: g.max((p) => p.price),
            avgPrice: g.average((p) => p.price),
            productCount: g.count(),
          })),
      );

      expect(result.length).to.be.greaterThan(0);
      result.forEach((r) => {
        expect(r.minPrice).to.be.lessThanOrEqual(r.maxPrice);
        expect(r.productCount).to.be.greaterThan(0);
      });
    });

    it("should group with multiple keys", async () => {
      const result = await executeSimple(db, () =>
        from(dbContext, "orders")
          .groupBy((o) => ({
            userId: o.user_id,
            status: o.status,
          }))
          .select((g) => ({
            customerId: g.key.userId,
            orderStatus: g.key.status,
            orderCount: g.count(),
            totalValue: g.sum((o) => o.total_amount),
          }))
          .orderBy((r) => r.customerId),
      );

      expect(result.length).to.be.greaterThan(0);
      result.forEach((r) => {
        expect(r.customerId).to.be.a("number");
        expect(r.orderStatus).to.be.a("string");
        expect(r.orderCount).to.be.greaterThan(0);
      });
    });
  });

  describe("ANY and ALL operations", () => {
    it("should check if any users exist", async () => {
      const result = await executeSimple(db, () => from(dbContext, "users").any());
      expect(result).to.be.true;
    });

    it("should check if any products are featured", async () => {
      const result = await executeSimple(db, () =>
        from(dbContext, "products").any((p) => p.is_featured === true),
      );
      expect(result).to.be.true;
    });

    it("should check if any orders exceed threshold with params", async () => {
      const result = await execute(
        db,
        (params) => from(dbContext, "orders").any((o) => o.total_amount > params.threshold),
        { threshold: 1000 },
      );
      expect(result).to.be.true;
    });

    it("should check if all products have prices", async () => {
      const result = await executeSimple(db, () =>
        from(dbContext, "products").all((p) => p.price > 0),
      );
      expect(result).to.be.true;
    });

    it("should check all with WHERE filter", async () => {
      const result = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.is_featured === true)
          .all((p) => p.stock > 0),
      );
      expect(result).to.be.a("boolean");
    });
  });

  describe("Advanced JOIN operations", () => {
    it("should join two tables", async () => {
      const result = await executeSimple(db, () =>
        from(dbContext, "orders").join(
          from(dbContext, "users"),
          (o) => o.user_id,
          (u) => u.id,
          (o, u) => ({
            orderNumber: o.order_number,
            customerName: u.name,
            orderTotal: o.total_amount,
          }),
        ),
      );

      expect(result.length).to.be.greaterThan(0);
      // The JOIN result selector actually works and returns the projected columns
      result.forEach((r) => {
        expect(r).to.have.property("orderNumber");
        expect(r).to.have.property("customerName");
        expect(r).to.have.property("orderTotal");
      });
    });

    it("should join users with departments", async () => {
      const result = await executeSimple(db, () =>
        from(dbContext, "users").join(
          from(dbContext, "departments"),
          (u) => u.department_id,
          (d) => d.id,
          (u, d) => ({ userName: u.name, deptName: d.name }),
        ),
      );

      expect(result.length).to.be.greaterThan(0);
      // JOIN result selector works - returns the projected columns
      result.forEach((r) => {
        expect(r).to.have.property("userName");
        expect(r).to.have.property("deptName");
      });
    });
  });

  describe("Pagination with SKIP and TAKE", () => {
    it("should take first N records", async () => {
      const result = await executeSimple(db, () => from(dbContext, "products").take(5));
      expect(result.length).to.equal(5);
    });

    it("should skip and take for pagination", async () => {
      const page1 = await executeSimple(db, () =>
        from(dbContext, "products")
          .orderBy((p) => p.id)
          .skip(0)
          .take(5),
      );

      const page2 = await executeSimple(db, () =>
        from(dbContext, "products")
          .orderBy((p) => p.id)
          .skip(5)
          .take(5),
      );

      expect(page1.length).to.equal(5);
      expect(page2.length).to.equal(5);

      // Ensure no overlap
      const page1Ids = page1.map((p) => p.id);
      const page2Ids = page2.map((p) => p.id);
      expect(page1Ids.filter((id) => page2Ids.includes(id))).to.be.empty;
    });

    it("should paginate with WHERE filter", async () => {
      const result = await execute(
        db,
        (params) =>
          from(dbContext, "products")
            .where((p) => p.price >= params.minPrice && p.price <= params.maxPrice)
            .orderBy((p) => p.price)
            .skip(2)
            .take(5),
        { minPrice: 100, maxPrice: 1000 },
      );

      expect(result.length).to.be.lessThanOrEqual(5);
      result.forEach((p) => {
        expect(p.price).to.be.at.least(100);
        expect(p.price).to.be.at.most(1000);
      });
    });
  });

  describe("Complex SELECT projections", () => {
    it("should project computed fields", async () => {
      const result = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.stock > 0)
          .select((p) => ({
            name: p.name,
            totalValue: p.price * p.stock,
            discountedPrice: p.price * 0.9,
            stockStatus: p.stock > 100 ? "High" : p.stock > 20 ? "Medium" : "Low",
          }))
          .take(10),
      );

      result.forEach((r) => {
        expect(r.totalValue).to.be.a("number");
        expect(r.discountedPrice).to.be.a("number");
        expect(["High", "Medium", "Low"]).to.include(r.stockStatus);
      });
    });

    it("should project with parameters in WHERE", async () => {
      const result = await execute(
        db,
        (params) =>
          from(dbContext, "products")
            .where((p) => p.price >= params.minPrice && p.price <= params.maxPrice)
            .select((p) => ({
              name: p.name,
              price: p.price,
              stock: p.stock,
            }))
            .take(10),
        { minPrice: 100, maxPrice: 500 },
      );

      expect(result.length).to.be.greaterThan(0);
      result.forEach((r) => {
        expect(r.price).to.be.at.least(100);
        expect(r.price).to.be.at.most(500);
      });
    });

    it("should project grouped aggregates", async () => {
      const result = await executeSimple(db, () =>
        from(dbContext, "orders")
          .groupBy((o) => ({ userId: o.user_id }))
          .select((g) => ({
            customerId: g.key.userId,
            orderCount: g.count(),
            totalSpent: g.sum((o) => o.total_amount),
            avgOrderValue: g.average((o) => o.total_amount),
          }))
          .take(10),
      );

      result.forEach((r) => {
        expect(r).to.have.all.keys("customerId", "orderCount", "totalSpent", "avgOrderValue");
        expect(r.orderCount).to.be.greaterThan(0);
      });
    });
  });

  describe("Real-world scenarios", () => {
    it("should find top spending customers", async () => {
      const result = await executeSimple(db, () =>
        from(dbContext, "orders")
          .groupBy((o) => ({ userId: o.user_id }))
          .select((g) => ({
            customerId: g.key.userId,
            totalOrders: g.count(),
            totalSpent: g.sum((o) => o.total_amount),
          }))
          .orderByDescending((r) => r.totalSpent)
          .take(5),
      );

      expect(result.length).to.be.lessThanOrEqual(5);
      result.forEach((r) => {
        expect(r.customerId).to.be.a("number");
        expect(r.totalSpent).to.be.greaterThan(0);
      });

      // Verify ordering
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1]!.totalSpent).to.be.at.least(result[i]!.totalSpent);
      }
    });

    it("should find products needing restock", async () => {
      const result = await executeSimple(db, () =>
        from(dbContext, "inventory")
          .where((i) => i.reorder_point !== null && i.quantity_on_hand <= i.reorder_point)
          .select((i) => ({
            productId: i.product_id,
            currentStock: i.quantity_on_hand,
            reorderPoint: i.reorder_point,
            reorderQuantity: i.reorder_quantity,
            warehouseLocation: i.warehouse_location,
          })),
      );

      result.forEach((r) => {
        expect(r.productId).to.be.a("number");
        if (r.reorderPoint !== null) {
          expect(r.currentStock).to.be.at.most(r.reorderPoint);
        }
      });
    });

    it("should search products with filtering and pagination", async () => {
      const result = await execute(
        db,
        (params) =>
          from(dbContext, "products")
            .where(
              (p) =>
                p.name.toLowerCase().includes(params.searchTerm) &&
                p.price >= params.minPrice &&
                p.price <= params.maxPrice &&
                p.stock > 0,
            )
            .orderBy((p) => p.rating ?? 0)
            .thenBy((p) => p.name)
            .skip((params.page - 1) * params.pageSize)
            .take(params.pageSize)
            .select((p) => ({
              id: p.id,
              name: p.name,
              price: p.price,
              rating: p.rating,
              inStock: p.stock > 0,
            })),
        {
          searchTerm: "e",
          minPrice: 50,
          maxPrice: 500,
          page: 1,
          pageSize: 10,
        },
      );

      expect(result.length).to.be.lessThanOrEqual(10);
      result.forEach((p) => {
        expect(p.name.toLowerCase()).to.include("e");
        expect(p.price).to.be.at.least(50);
        expect(p.price).to.be.at.most(500);
        expect(p.inStock).to.be.true;
      });
    });
  });
});
