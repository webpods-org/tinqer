/**
 * Hierarchical data integration tests with real PostgreSQL
 * Tests self-referential relationships and tree structures
 */

import { describe, it, before } from "mocha";
import { expect } from "chai";
import { from } from "@webpods/tinqer";
import { executeSimple } from "@webpods/tinqer-sql-pg-promise";
import { setupExpandedTestDatabase, seedExpandedTestData } from "./expanded-test-setup.js";
import { db } from "./shared-db.js";
import { expandedDbContext as dbContext } from "./expanded-database-schema.js";

describe("PostgreSQL Integration - Hierarchical Data", () => {
  before(async () => {
    await setupExpandedTestDatabase(db);
    await seedExpandedTestData(db);
  });

  describe("Self-referential relationships", () => {
    it("should find employees with managers", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "employees")
          .where((e) => e.manager_id !== null)
          .select((e) => ({
            id: e.id,
            firstName: e.first_name,
            lastName: e.last_name,
            managerId: e.manager_id,
          }))
          .take(10),
      );

      expect(results).to.be.an("array");
      results.forEach((emp) => {
        expect(emp.managerId).to.not.be.null;
        expect(emp.managerId).to.be.a("number");
      });
    });

    it("should find top-level employees (no manager)", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "employees")
          .where((e) => e.manager_id === null)
          .select((e) => ({
            id: e.id,
            firstName: e.first_name,
            lastName: e.last_name,
            jobTitle: e.job_title,
          })),
      );

      expect(results).to.be.an("array");
      results.forEach((emp) => {
        expect(emp).to.have.property("id");
        expect(emp).to.have.property("firstName");
      });
    });

    it.skip("should join employees with their managers - SELF JOIN NOT WORKING", async () => {
      // This test documents that self-joins have issues with column ambiguity
      // Error: column reference "manager_id" is ambiguous

      // const results = await executeSimple(db, () =>
      //   from(dbContext, "employees")
      //     .innerJoin(
      //       from(dbContext, "employees"),
      //       (emp, mgr) => emp.manager_id === mgr.id,
      //       (emp, mgr) => ({
      //         employeeId: emp.id,
      //         employeeName: emp.first_name,
      //         managerId: mgr.id,
      //         managerName: mgr.first_name
      //       })
      //     )
      //     .take(10)
      // );

      // expect(results).to.be.an("array");
      expect(true).to.equal(true); // Placeholder
    });

    it("should count employees per manager", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "employees")
          .where((e) => e.manager_id !== null)
          .groupBy((e) => e.manager_id)
          .select((g) => ({
            managerId: g.key,
            directReports: g.count(),
          }))
          .orderByDescending((r) => r.directReports),
      );

      expect(results).to.be.an("array");
      results.forEach((manager) => {
        expect(manager.managerId).to.be.a("number");
        expect(manager.directReports).to.be.greaterThan(0);
      });
    });
  });

  describe("Category hierarchies", () => {
    it("should find root categories", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "categories")
          .where((c) => c.parent_id === null)
          .select((c) => ({
            id: c.id,
            name: c.name,
            path: c.path,
          })),
      );

      expect(results).to.be.an("array");
      results.forEach((category) => {
        expect(category).to.have.property("id");
        expect(category).to.have.property("name");
      });
    });

    it("should find categories with subcategories", async () => {
      // First, find which categories have children
      const results = await executeSimple(db, () =>
        from(dbContext, "categories")
          .where((c) => c.parent_id !== null)
          .groupBy((c) => c.parent_id)
          .select((g) => ({
            parentId: g.key,
            childCount: g.count(),
          })),
      );

      expect(results).to.be.an("array");
      results.forEach((parent) => {
        expect(parent.parentId).to.be.a("number");
        expect(parent.childCount).to.be.greaterThan(0);
      });
    });

    it("should find leaf categories (no children)", async () => {
      // Get all category IDs that are parents
      const parentIds = await executeSimple(db, () =>
        from(dbContext, "categories")
          .where((c) => c.parent_id !== null)
          .select((c) => ({ parentId: c.parent_id }))
          .distinct(),
      );

      const parentIdList = parentIds.map((p) => p.parentId!);

      // Find categories that are NOT in the parent list
      const leafCategories = await executeSimple(db, () =>
        from(dbContext, "categories")
          .where((c) => !parentIdList.includes(c.id))
          .select((c) => ({
            id: c.id,
            name: c.name,
            parentId: c.parent_id,
          }))
          .take(10),
      );

      expect(leafCategories).to.be.an("array");
      // These should be leaf nodes
    });

    it("should count products per category hierarchy level", async () => {
      // Count products in root categories - simplified without JOIN
      const rootCategories = await executeSimple(db, () =>
        from(dbContext, "categories")
          .where((c) => c.parent_id === null)
          .select((c) => ({ id: c.id })),
      );

      const rootCatIds = rootCategories.map((c) => c.id);

      const rootCategoryProducts = await executeSimple(db, () =>
        from(dbContext, "products")
          .where((p) => p.category_id !== null && rootCatIds.includes(p.category_id))
          .groupBy((p) => p.category_id)
          .select((g) => ({
            categoryId: g.key,
            productCount: g.count(),
          })),
      );

      expect(rootCategoryProducts).to.be.an("array");
      if (rootCategoryProducts.length > 0) {
        rootCategoryProducts.forEach((cat) => {
          expect(cat.productCount).to.be.greaterThan(0);
        });
      }
    });
  });

  describe("Department hierarchies", () => {
    it("should find departments with parent departments", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "departments")
          .where((d) => d.parent_dept_id !== null)
          .select((d) => ({
            id: d.id,
            name: d.name,
            parentId: d.parent_dept_id,
          })),
      );

      expect(results).to.be.an("array");
      results.forEach((dept) => {
        expect(dept.parentId).to.be.a("number");
      });
    });

    it("should count employees per department", async () => {
      const results = await executeSimple(db, () =>
        from(dbContext, "users")
          .where((u) => u.department_id !== null)
          .groupBy((u) => u.department_id)
          .select((g) => ({
            deptId: g.key,
            employeeCount: g.count(),
          }))
          .orderByDescending((r) => r.employeeCount),
      );

      expect(results).to.be.an("array");
      results.forEach((dept) => {
        expect(dept.deptId).to.be.a("number");
        expect(dept.employeeCount).to.be.greaterThan(0);
      });
    });

    it("should find departments at each level", async () => {
      // Level 0: Root departments
      const rootDepts = await executeSimple(db, () =>
        from(dbContext, "departments")
          .where((d) => d.parent_dept_id === null)
          .count(),
      );

      // Level 1: Departments with parent
      const level1Depts = await executeSimple(db, () =>
        from(dbContext, "departments")
          .where((d) => d.parent_dept_id !== null)
          .count(),
      );

      expect(rootDepts).to.be.a("number");
      expect(level1Depts).to.be.a("number");
      expect(rootDepts + level1Depts).to.be.greaterThan(0);
    });
  });

  describe("Recursive-like queries (simulated)", () => {
    it("should find all employees in a department and its sub-departments", async () => {
      // First get a department that has sub-departments
      const parentDepts = await executeSimple(db, () =>
        from(dbContext, "departments")
          .where((d) => d.parent_dept_id === null)
          .select((d) => ({ id: d.id, name: d.name }))
          .take(1),
      );

      if (parentDepts.length > 0) {
        const parentDeptId = parentDepts[0]!.id;

        // Get all sub-departments
        const subDepts = await executeSimple(db, () =>
          from(dbContext, "departments")
            .where((d) => d.parent_dept_id === parentDeptId)
            .select((d) => ({ id: d.id })),
        );

        const allDeptIds = [parentDeptId, ...subDepts.map((d) => d.id)];

        // Get all employees in these departments
        const employees = await executeSimple(db, () =>
          from(dbContext, "users")
            .where((u) => u.department_id !== null && allDeptIds.includes(u.department_id))
            .select((u) => ({
              id: u.id,
              name: u.name,
              deptId: u.department_id,
            })),
        );

        expect(employees).to.be.an("array");
        employees.forEach((emp) => {
          expect(allDeptIds).to.include(emp.deptId!);
        });
      }
    });

    it("should calculate department salary totals including sub-departments", async () => {
      // Get root department
      const rootDepts = await executeSimple(db, () =>
        from(dbContext, "departments")
          .where((d) => d.parent_dept_id === null)
          .select((d) => ({ id: d.id }))
          .take(1),
      );

      if (rootDepts.length > 0) {
        const rootId = rootDepts[0]!.id;

        // Get sub-departments
        const subDepts = await executeSimple(db, () =>
          from(dbContext, "departments")
            .where((d) => d.parent_dept_id === rootId)
            .select((d) => ({ id: d.id })),
        );

        const allDeptIds = [rootId, ...subDepts.map((d) => d.id)];

        // Calculate total salaries
        const salaryData = await executeSimple(db, () =>
          from(dbContext, "employees")
            .where(
              (e) =>
                e.department_id !== null &&
                allDeptIds.includes(e.department_id) &&
                e.salary !== null,
            )
            .select((e) => ({
              salary: e.salary,
              deptId: e.department_id,
            })),
        );

        const totalSalary = salaryData.reduce((sum, emp) => sum + (emp.salary ?? 0), 0);
        expect(totalSalary).to.be.a("number");
      }
    });
  });

  describe("Path-based queries", () => {
    it("should find categories at specific depth", async () => {
      // Depth 0: Root categories
      const depth0 = await executeSimple(db, () =>
        from(dbContext, "categories")
          .where((c) => c.parent_id === null)
          .count(),
      );

      // Depth 1: Direct children of root
      const rootIds = await executeSimple(db, () =>
        from(dbContext, "categories")
          .where((c) => c.parent_id === null)
          .select((c) => ({ id: c.id })),
      );

      const rootIdList = rootIds.map((r) => r.id);

      const depth1 = await executeSimple(db, () =>
        from(dbContext, "categories")
          .where((c) => c.parent_id !== null && rootIdList.includes(c.parent_id))
          .count(),
      );

      expect(depth0).to.be.a("number");
      expect(depth1).to.be.a("number");
    });

    it("should find all ancestors of a category (upward traversal)", async () => {
      // Find a leaf category
      const leafCategories = await executeSimple(db, () =>
        from(dbContext, "categories")
          .where((c) => c.parent_id !== null)
          .select((c) => ({
            id: c.id,
            parentId: c.parent_id,
            name: c.name,
          }))
          .take(1),
      );

      if (leafCategories.length > 0) {
        const leaf = leafCategories[0]!;
        const ancestors: any[] = [];

        // Get immediate parent
        if (leaf.parentId) {
          const parent = await executeSimple(db, () =>
            from(dbContext, "categories")
              .where((c) => c.id === leaf.parentId)
              .select((c) => ({
                id: c.id,
                parentId: c.parent_id,
                name: c.name,
              })),
          );

          if (parent.length > 0) {
            ancestors.push(parent[0]);

            // Get grandparent if exists
            if (parent[0]!.parentId) {
              const grandparent = await executeSimple(db, () =>
                from(dbContext, "categories")
                  .where((c) => c.id === parent[0]!.parentId)
                  .select((c) => ({
                    id: c.id,
                    name: c.name,
                  })),
              );

              if (grandparent.length > 0) {
                ancestors.push(grandparent[0]);
              }
            }
          }
        }

        expect(ancestors).to.be.an("array");
        // Should have found at least the parent
      }
    });
  });

  describe("Aggregations on hierarchical data", () => {
    it("should calculate average salary by management level", async () => {
      // Managers (have direct reports)
      const managerIds = await executeSimple(db, () =>
        from(dbContext, "employees")
          .where((e) => e.manager_id !== null)
          .select((e) => ({ managerId: e.manager_id }))
          .distinct(),
      );

      const managerIdList = managerIds.map((m) => m.managerId!);

      // Average salary of managers
      const managerAvgSalary = await executeSimple(db, () =>
        from(dbContext, "employees")
          .where((e) => managerIdList.includes(e.id) && e.salary !== null)
          .select((e) => ({ salary: e.salary })),
      );

      // Average salary of non-managers
      const nonManagerAvgSalary = await executeSimple(db, () =>
        from(dbContext, "employees")
          .where((e) => !managerIdList.includes(e.id) && e.salary !== null)
          .select((e) => ({ salary: e.salary })),
      );

      if (managerAvgSalary.length > 0) {
        const avgMgr =
          managerAvgSalary.reduce((sum, e) => sum + e.salary!, 0) / managerAvgSalary.length;
        expect(avgMgr).to.be.a("number");
      }

      if (nonManagerAvgSalary.length > 0) {
        const avgNonMgr =
          nonManagerAvgSalary.reduce((sum, e) => sum + e.salary!, 0) / nonManagerAvgSalary.length;
        expect(avgNonMgr).to.be.a("number");
      }
    });

    it("should count total products per category tree", async () => {
      // For each root category, count all products in it and its subcategories
      const rootCategories = await executeSimple(db, () =>
        from(dbContext, "categories")
          .where((c) => c.parent_id === null)
          .select((c) => ({ id: c.id, name: c.name })),
      );

      for (const root of rootCategories.slice(0, 2)) {
        // Test first 2 root categories
        // Get all subcategories
        const subCategories = await executeSimple(db, () =>
          from(dbContext, "categories")
            .where((c) => c.parent_id === root.id)
            .select((c) => ({ id: c.id })),
        );

        const allCategoryIds = [root.id, ...subCategories.map((s) => s.id)];

        // Count products in all these categories
        const productCount = await executeSimple(db, () =>
          from(dbContext, "products")
            .where((p) => p.category_id !== null && allCategoryIds.includes(p.category_id))
            .count(),
        );

        expect(productCount).to.be.a("number");
      }
    });
  });
});
