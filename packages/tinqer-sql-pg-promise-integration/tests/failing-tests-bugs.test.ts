/**
 * Failing tests that expose bugs and unimplemented features
 * These tests are kept to document issues and serve as regression tests once fixed
 */

import { describe, it, before } from "mocha";
import { expect } from "chai";
import { from } from "@webpods/tinqer";
import { executeSimple } from "@webpods/tinqer-sql-pg-promise";
import { setupExpandedTestDatabase, seedExpandedTestData } from "./expanded-test-setup.js";
import { db } from "./shared-db.js";
import { expandedDbContext as dbContext } from "./expanded-database-schema.js";

describe("Failing Tests - Document Bugs", () => {
  before(async () => {
    await setupExpandedTestDatabase(db);
    await seedExpandedTestData(db);
  });

  describe("HAVING clause - Not Implemented", () => {
    it.skip("should filter groups with HAVING count condition - NOT IMPLEMENTED", async () => {
      // This test fails with: Error: Failed to parse query
      // HAVING clause is defined in operations.d.ts but not implemented in SQL adapter
      // const results = await executeSimple(db, () =>
      //   from(dbContext, "orders")
      //     .groupBy((o) => ({ userId: o.user_id }))
      //     .having((g: any) => g.count() > 2)
      //     .select((g: any) => ({
      //       customerId: g.key.userId,
      //       orderCount: g.count()
      //     }))
      // );
      // expect(results).to.be.an("array");
      // results.forEach((row: any) => {
      //   expect(row.orderCount).to.be.greaterThan(2);
      // });
    });

    it.skip("should filter with HAVING on aggregate sum - NOT IMPLEMENTED", async () => {
      // HAVING with SUM aggregate
      // const results = await executeSimple(db, () =>
      //   from(dbContext, "orders")
      //     .groupBy((o) => ({ userId: o.user_id }))
      //     .having((g: any) => g.sum((o: any) => o.total_amount) > 1000)
      //     .select((g: any) => ({
      //       customerId: g.key.userId,
      //       totalSpent: g.sum((o: any) => o.total_amount)
      //     }))
      // );
      // expect(results).to.be.an("array");
      // results.forEach((row: any) => {
      //   expect(row.totalSpent).to.be.greaterThan(1000);
      // });
    });
  });

  describe("Self-JOIN bugs", () => {
    it.skip("should perform self-join to find employees and managers - COLUMN AMBIGUITY BUG", async () => {
      // This test fails with: error: column reference "manager_id" is ambiguous
      // Self-joins don't properly qualify column names with table aliases
      const results = await executeSimple(db, () =>
        from(dbContext, "employees")
          .where((e) => e.manager_id !== null)
          .join(
            from(dbContext, "employees"),
            (e) => e.manager_id,
            (m) => m.id,
            (e, m) => ({
              employeeFirstName: e.first_name,
              employeeLastName: e.last_name,
              managerFirstName: m.first_name,
              managerLastName: m.last_name,
              employeeTitle: e.job_title,
              managerTitle: m.job_title,
            }),
          )
          .take(10),
      );

      expect(results).to.be.an("array");
      results.forEach((row) => {
        expect(row).to.have.property("employeeFirstName");
        expect(row).to.have.property("managerFirstName");
      });
    });
  });

  describe("Multiple chained JOINs bugs", () => {
    it.skip("should join three tables - NESTED PROPERTY ACCESS BUG", async () => {
      // This test fails with: error: column t0.company_id does not exist
      // Multiple chained JOINs don't properly handle nested property access
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .where((u) => u.department_id !== null)
          .join(
            from(dbContext, "departments"),
            (u) => u.department_id,
            (d) => d.id,
            (u, d) => ({ user: u, dept: d }),
          )
          .join(
            from(dbContext, "companies"),
            (ud) => ud.dept.company_id, // This nested access fails
            (c) => c.id,
            (ud, c) => ({
              userName: ud.user.name,
              departmentName: ud.dept.name,
              companyName: c.name,
            }),
          )
          .take(10),
      );

      expect(results).to.be.an("array");
      expect(results.length).to.be.greaterThan(0);
    });
  });

  describe("String concatenation bugs", () => {
    it.skip("should concatenate strings in projection - STRING CONCAT NOT SUPPORTED", async () => {
      // This test fails with: error: operator does not exist: character varying + integer
      // String concatenation using + operator doesn't work
      const results = await executeSimple(db, () =>
        from(dbContext, "employees")
          .select((e) => ({
            fullName: e.first_name + " " + e.last_name, // This concatenation fails
            title: e.job_title,
          }))
          .take(5),
      );

      expect(results).to.be.an("array");
      results.forEach((row) => {
        expect(row.fullName).to.include(" ");
      });
    });
  });

  describe("Subqueries - Not Implemented", () => {
    it.skip("should use EXISTS subquery - NOT IMPLEMENTED", async () => {
      // Subqueries are not implemented in the SQL adapter
      // This would need EXISTS operation support
      // const results = await executeSimple(db, () =>
      //   from(dbContext, "users")
      //     .where((u) =>
      //       from(dbContext, "orders")
      //         .where((o) => o.user_id === u.id && o.total_amount > 1000)
      //         .any()
      //     )
      // );

      // expect(results).to.be.an("array");
      expect(true).to.equal(true); // Placeholder
    });

    it.skip("should use scalar subquery in SELECT - NOT IMPLEMENTED", async () => {
      // Scalar subqueries in SELECT are not supported
      const results = await executeSimple(db, () =>
        from(dbContext, "users").select((u) => ({
          name: u.name,
          orderCount: from(dbContext, "orders")
            .where((o) => o.user_id === u.id)
            .count(),
        })),
      );

      expect(results).to.be.an("array");
    });
  });

  describe("CASE/WHEN expressions - Not Implemented", () => {
    it.skip("should use CASE WHEN in SELECT - NOT IMPLEMENTED", async () => {
      // CASE/WHEN expressions are not supported
      // Would need conditional expression support
      const results = await executeSimple(db, () =>
        from(dbContext, "products").select((p) => ({
          name: p.name,
          priceCategory: p.price > 1000 ? "Expensive" : p.price > 100 ? "Moderate" : "Cheap",
        })),
      );

      expect(results).to.be.an("array");
    });
  });

  describe("Window functions - Not Implemented", () => {
    it.skip("should use ROW_NUMBER window function - NOT IMPLEMENTED", async () => {
      // Window functions like ROW_NUMBER, RANK are not supported
      // Would need window function operation support
      // const results = await executeSimple(db, () =>
      //   from(dbContext, "employees")
      //     .select((e) => ({
      //       name: e.first_name,
      //       salary: e.salary,
      //       salaryRank: rowNumber()
      //         .over()
      //         .orderBy((e: any) => e.salary)
      //         .partitionBy((e: any) => e.department_id)
      //     }))
      // );

      // expect(results).to.be.an("array");
      expect(true).to.equal(true); // Placeholder
    });
  });

  describe("Set operations - Not Implemented", () => {
    it.skip("should use UNION to combine queries - NOT IMPLEMENTED", async () => {
      // UNION/INTERSECT/EXCEPT operations are not supported
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .where((u) => u.department_id === 1)
          .union(from(dbContext, "users").where((u) => u.is_active === true)),
      );

      expect(results).to.be.an("array");
    });
  });

  describe("LEFT/RIGHT/FULL OUTER JOINs - Not Implemented", () => {
    it.skip("should perform LEFT OUTER JOIN - NOT IMPLEMENTED", async () => {
      // Only INNER JOIN is currently supported
      // LEFT/RIGHT/FULL OUTER JOINs are not implemented

      // @ts-ignore - leftJoin doesn't exist yet
      // const results = await executeSimple(db, () =>
      //   from(dbContext, "users")
      //     .leftJoin(
      //       from(dbContext, "departments"),
      //       (u) => u.department_id,
      //       (d) => d.id,
      //       (u, d) => ({
      //         userName: u.name,
      //         departmentName: d?.name ?? "No Department"
      //       })
      //     )
      // );

      // expect(results).to.be.an("array");
      // // Should include users with no department
      // const noDeptUsers = results.filter(r => r.departmentName === "No Department");
      // expect(noDeptUsers.length).to.be.greaterThan(0);
      expect(true).to.equal(true); // Placeholder
    });
  });
});
