/**
 * Pagination patterns integration tests with real PostgreSQL
 * Tests SKIP, TAKE, and various pagination strategies
 */

import { describe, it, before } from "mocha";
import { expect } from "chai";
import { from } from "@webpods/tinqer";
import { execute, executeSimple } from "@webpods/tinqer-sql-pg-promise";
import { setupExpandedTestDatabase, seedExpandedTestData } from "./expanded-test-setup.js";
import { db } from "./shared-db.js";
import { expandedDbContext as dbContext } from "./expanded-database-schema.js";

describe("PostgreSQL Integration - Pagination Patterns", () => {
  before(async () => {
    await setupExpandedTestDatabase(db);
    await seedExpandedTestData(db);
  });

  describe("Basic pagination with SKIP and TAKE", () => {
    it("should paginate with take only", async () => {
      const pageSize = 10;
      
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .orderBy((p) => p.id)
          .take(pageSize)
          .select((p) => ({ id: p.id, name: p.name }))
      );

      expect(results).to.be.an("array");
      expect(results.length).to.equal(pageSize);
      // Should get first 10 products
      expect(results[0]!.id).to.equal(1);
    });

    it("should paginate with skip and take", async () => {
      const pageSize = 10;
      const pageNumber = 2; // Zero-indexed, so this is the 3rd page
      
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .orderBy((p) => p.id)
          .skip(pageNumber * pageSize)
          .take(pageSize)
          .select((p) => ({ id: p.id, name: p.name }))
      );

      expect(results).to.be.an("array");
      expect(results.length).to.be.lessThanOrEqual(pageSize);
      // Should start from product 21
      if (results.length > 0) {
        expect(results[0]!.id).to.equal(21);
      }
    });

    it("should handle last page with partial results", async () => {
      // Get total count first
      const totalCount = await executeSimple(db, () =>
        from(dbContext, "users").count()
      );

      const pageSize = 10;
      const lastPageStart = Math.floor(totalCount / pageSize) * pageSize;
      
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .orderBy((u) => u.id)
          .skip(lastPageStart)
          .take(pageSize)
          .select((u) => ({ id: u.id }))
      );

      expect(results).to.be.an("array");
      expect(results.length).to.equal(totalCount % pageSize || pageSize);
    });
  });

  describe("Pagination with parameters", () => {
    it("should paginate using parameters", async () => {
      const params = {
        offset: 10,
        limit: 5
      };

      const results = await execute(
        db,
        (p) => from(dbContext, "orders")
          .orderBy((o) => o.order_date)
          .skip(p.offset)
          .take(p.limit)
          .select((o) => ({ 
            id: o.id, 
            orderNumber: o.order_number 
          })),
        params
      );

      expect(results).to.be.an("array");
      expect(results.length).to.be.lessThanOrEqual(params.limit);
    });

    it("should implement page number based pagination", async () => {
      const params = {
        page: 3, // 1-indexed page number
        pageSize: 15
      };

      const results = await execute(
        db,
        (p) => from(dbContext, "products")
          .orderBy((pr) => pr.id)
          .skip((p.page - 1) * p.pageSize)
          .take(p.pageSize)
          .select((pr) => ({ id: pr.id })),
        params
      );

      expect(results).to.be.an("array");
      expect(results.length).to.be.lessThanOrEqual(params.pageSize);
      // Should start from product 31 (page 3, 15 per page)
      if (results.length > 0) {
        expect(results[0]!.id).to.equal(31);
      }
    });
  });

  describe("Pagination with ordering", () => {
    it("should paginate with ascending order", async () => {
      const page1 = await executeSimple(db, () =>
        from(dbContext, "products")
          .orderBy((p) => p.price)
          .take(5)
          .select((p) => ({ id: p.id, price: p.price }))
      );

      const page2 = await executeSimple(db, () =>
        from(dbContext, "products")
          .orderBy((p) => p.price)
          .skip(5)
          .take(5)
          .select((p) => ({ id: p.id, price: p.price }))
      );

      expect(page1).to.be.an("array");
      expect(page2).to.be.an("array");
      
      // Page 2 prices should be >= page 1 max price
      if (page1.length > 0 && page2.length > 0) {
        const page1MaxPrice = Math.max(...page1.map(p => p.price));
        const page2MinPrice = Math.min(...page2.map(p => p.price));
        expect(page2MinPrice).to.be.greaterThanOrEqual(page1MaxPrice);
      }
    });

    it("should paginate with descending order", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "orders")
          .orderByDescending((o) => o.total_amount)
          .skip(5)
          .take(10)
          .select((o) => ({ 
            id: o.id, 
            total: o.total_amount 
          }))
      );

      expect(results).to.be.an("array");
      // Verify descending order within the page
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.total).to.be.greaterThanOrEqual(results[i]!.total);
      }
    });

    it("should paginate with multiple order columns", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .orderBy((p) => p.category_id ?? 999999)
          .thenByDescending((p) => p.price)
          .skip(10)
          .take(10)
          .select((p) => ({ 
            id: p.id,
            category: p.category_id,
            price: p.price 
          }))
      );

      expect(results).to.be.an("array");
      // Verify ordering
      for (let i = 1; i < results.length; i++) {
        const prev = results[i - 1]!;
        const curr = results[i]!;
        const prevCat = prev.category ?? 999999;
        const currCat = curr.category ?? 999999;
        
        if (prevCat === currCat) {
          expect(prev.price).to.be.greaterThanOrEqual(curr.price);
        } else {
          expect(prevCat).to.be.lessThanOrEqual(currCat);
        }
      }
    });
  });

  describe("Pagination with filtering", () => {
    it("should paginate filtered results", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.price > 100)
          .orderBy((p) => p.id)
          .skip(5)
          .take(10)
          .select((p) => ({ 
            id: p.id, 
            price: p.price 
          }))
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.price).to.be.greaterThan(100);
      });
    });

    it("should handle pagination with complex WHERE", async () => {
      const params = {
        minPrice: 50,
        maxPrice: 500,
        offset: 0,
        limit: 15
      };

      const results = await execute(
        db,
        (p) => from(dbContext, "products")
          .where((pr) => 
            pr.price >= p.minPrice &&
            pr.price <= p.maxPrice &&
            pr.stock > 0
          )
          .orderBy((pr) => pr.price)
          .skip(p.offset)
          .take(p.limit)
          .select((pr) => ({ 
            id: pr.id,
            price: pr.price,
            stock: pr.stock
          })),
        params
      );

      expect(results).to.be.an("array");
      results.forEach((product) => {
        expect(product.price).to.be.within(params.minPrice, params.maxPrice);
        expect(product.stock).to.be.greaterThan(0);
      });
    });
  });

  describe("Pagination with aggregations", () => {
    it("should paginate grouped results", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "orders")
          .groupBy((o) => o.user_id)
          .select((g) => ({
            userId: g.key,
            orderCount: g.count(),
            totalSpent: g.sum((o) => o.total_amount)
          }))
          .orderByDescending((r) => r.totalSpent)
          .skip(5)
          .take(10)
      );

      expect(results).to.be.an("array");
      expect(results.length).to.be.lessThanOrEqual(10);
      // Verify descending order by total spent
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.totalSpent).to.be.greaterThanOrEqual(results[i]!.totalSpent);
      }
    });

    it("should paginate distinct results", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "orders")
          .select((o) => ({ status: o.status }))
          .distinct()
          .orderBy((r) => r.status)
          .skip(1)
          .take(3)
      );

      expect(results).to.be.an("array");
      expect(results.length).to.be.lessThanOrEqual(3);
      // Check uniqueness
      const statuses = results.map(r => r.status);
      const uniqueStatuses = [...new Set(statuses)];
      expect(statuses.length).to.equal(uniqueStatuses.length);
    });
  });

  describe("Cursor-based pagination patterns", () => {
    it("should implement cursor pagination with ID", async () => {
      // First page
      const firstPage = await executeSimple(db, () =>
        from(dbContext, "users")
          .orderBy((u) => u.id)
          .take(10)
          .select((u) => ({ id: u.id, name: u.name }))
      );

      expect(firstPage).to.have.lengthOf(10);
      const lastId = firstPage[firstPage.length - 1]!.id;

      // Next page using cursor
      const nextPage = await executeSimple(db, () =>
        from(dbContext, "users")
          .where((u) => u.id > lastId)
          .orderBy((u) => u.id)
          .take(10)
          .select((u) => ({ id: u.id, name: u.name }))
      );

      expect(nextPage).to.be.an("array");
      if (nextPage.length > 0) {
        expect(nextPage[0]!.id).to.be.greaterThan(lastId);
      }
    });

    it("should implement cursor pagination with timestamp", async () => {
      // First page
      const firstPage = await executeSimple(db, () =>
        from(dbContext, "orders")
          .orderByDescending((o) => o.order_date)
          .take(5)
          .select((o) => ({ 
            id: o.id,
            orderDate: o.order_date 
          }))
      );

      if (firstPage.length > 0) {
        const lastDate = firstPage[firstPage.length - 1]!.orderDate;

        // Next page using date cursor
        const nextPage = await executeSimple(db, () =>
          from(dbContext, "orders")
            .where((o) => o.order_date < lastDate)
            .orderByDescending((o) => o.order_date)
            .take(5)
            .select((o) => ({ 
              id: o.id,
              orderDate: o.order_date 
            }))
        );

        expect(nextPage).to.be.an("array");
        if (nextPage.length > 0) {
          expect(new Date(nextPage[0]!.orderDate).getTime())
            .to.be.lessThan(new Date(lastDate).getTime());
        }
      }
    });
  });

  describe("Pagination edge cases", () => {
    it("should handle skip beyond total count", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "categories")
          .skip(999999)
          .take(10)
          .select((c) => ({ id: c.id }))
      );

      expect(results).to.be.an("array");
      expect(results).to.be.empty;
    });

    it("should handle take 0", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .take(0)
          .select((p) => ({ id: p.id }))
      );

      expect(results).to.be.an("array");
      expect(results).to.be.empty;
    });

    it("should handle skip 0", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "products")
          .orderBy((p) => p.id)
          .skip(0)
          .take(5)
          .select((p) => ({ id: p.id }))
      );

      expect(results).to.be.an("array");
      expect(results.length).to.equal(5);
      expect(results[0]!.id).to.equal(1);
    });

    it("should handle very large take values", async () => {
      const totalCount = await executeSimple(db, () =>
        from(dbContext, "departments").count()
      );

      const results = await executeSimple(db, () =>
        from(dbContext, "departments")
          .take(999999)
          .select((d) => ({ id: d.id }))
      );

      expect(results).to.be.an("array");
      expect(results.length).to.equal(totalCount);
    });
  });

  describe("Pagination performance patterns", () => {
    it("should efficiently paginate with indexed columns", async () => {
      const startTime = Date.now();
      
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .orderBy((u) => u.id) // ID is primary key, indexed
          .skip(100)
          .take(10)
          .select((u) => ({ id: u.id }))
      );

      const duration = Date.now() - startTime;

      expect(results).to.be.an("array");
      expect(duration).to.be.lessThan(500); // Should be fast with index
    });

    it("should get total count for pagination metadata", async () => {
      // Common pattern: get count and page data
      const [totalCount, pageData] = await Promise.all([
        executeSimple(db, () =>
          from(dbContext, "products")
            .where((p) => p.stock > 0)
            .count()
        ),
        executeSimple(db, () =>
          from(dbContext, "products")
            .where((p) => p.stock > 0)
            .orderBy((p) => p.id)
            .skip(10)
            .take(10)
            .select((p) => ({ id: p.id, name: p.name }))
        )
      ]);

      expect(totalCount).to.be.a("number");
      expect(pageData).to.be.an("array");
      
      const totalPages = Math.ceil(totalCount / 10);
      expect(totalPages).to.be.greaterThan(0);
    });
  });
});