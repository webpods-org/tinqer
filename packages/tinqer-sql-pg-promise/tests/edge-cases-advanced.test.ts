import { describe, it } from "mocha";
import { expect } from "chai";
import { query } from "../dist/index.js";
import { from } from "@webpods/tinqer";

describe("Advanced Edge Cases and Corner Scenarios", () => {
  interface TestTable {
    id: number;
    value: number | null;
    text: string | null;
    flag: boolean;
    data: unknown;
    createdAt: Date;
  }

  describe("NULL value edge cases", () => {
    it("should handle NULL in arithmetic with COALESCE", () => {
      const result = query(
        () => from<TestTable>("items").where((i) => (i.value ?? 0) + 10 > 20),
        {},
      );

      expect(result.sql).to.include("COALESCE");
      expect(result.sql).to.include("+ ");
    });

    it("should handle NULL in string concatenation", () => {
      const result = query(
        () =>
          from<TestTable>("items").select((i) => ({
            combined: (i.text ?? "") + "_suffix",
          })),
        {},
      );

      expect(result.sql).to.include("COALESCE");
      expect(result.sql).to.include("|| "); // PostgreSQL string concatenation
    });

    it("should handle multiple NULL checks in complex conditions", () => {
      const result = query(
        () =>
          from<TestTable>("items").where(
            (i) => i.value === null || (i.text === null && i.flag === true),
          ),
        {},
      );

      expect(result.sql).to.include("IS NULL");
      expect(result.sql).to.include("OR");
      expect(result.sql).to.include("AND");
    });

    it("should handle NULL in BETWEEN-like conditions", () => {
      const result = query(
        () =>
          from<TestTable>("items").where(
            (i) => i.value !== null && i.value >= 10 && i.value <= 100,
          ),
        {},
      );

      expect(result.sql).to.include("IS NOT NULL");
      expect(result.sql).to.include(">=");
      expect(result.sql).to.include("<=");
    });
  });

  describe("Special character handling", () => {
    it("should handle table names with special characters", () => {
      interface SpecialTable {
        "user-id": number;
        "first.name": string;
        "last@name": string;
      }

      const result = query(() => from<SpecialTable>("user-accounts"), {});

      expect(result.sql).to.include('"user-accounts"');
    });

    it("should escape quotes in string literals", () => {
      const result = query(
        () => from<TestTable>("items").where((i) => i.text === "O'Reilly's \"Book\""),
        {},
      );

      expect(result.params.__p1).to.equal("O'Reilly's \"Book\"");
    });

    it("should handle Unicode characters in strings", () => {
      const result = query(
        () => from<TestTable>("items").where((i) => i.text !== null && i.text.includes("😀🎉")),
        {},
      );

      expect(result.sql).to.include("LIKE");
    });

    it("should handle newlines and tabs in string literals", () => {
      const result = query(
        () => from<TestTable>("items").where((i) => i.text === "line1\nline2\ttab"),
        {},
      );

      expect(result.params.__p1).to.equal("line1\nline2\ttab");
    });
  });

  describe("Numeric edge cases", () => {
    it("should handle JavaScript MAX_SAFE_INTEGER", () => {
      const result = query(
        () => from<TestTable>("items").where((i) => i.value === Number.MAX_SAFE_INTEGER),
        {},
      );

      expect(result.params.__p1).to.equal(Number.MAX_SAFE_INTEGER);
    });

    it("should handle negative values", () => {
      const result = query(
        () => from<TestTable>("items").where((i) => i.value !== null && i.value > -1000),
        {},
      );

      expect(result.params.__p1).to.equal(-1000);
    });

    it("should handle floating point precision", () => {
      const result = query(
        () => from<TestTable>("items").where((i) => i.value !== null && i.value === 0.3),
        {},
      );

      expect(result.params.__p1).to.equal(0.3);
    });

    it("should handle scientific notation", () => {
      const result = query(
        () => from<TestTable>("items").where((i) => i.value !== null && i.value > 1e10),
        {},
      );

      expect(result.params.__p1).to.equal(10000000000);
    });
  });

  describe("Boolean operation edge cases", () => {
    it("should handle double negation", () => {
      const result = query(() => from<TestTable>("items").where((i) => !!i.flag), {});

      expect(result.sql).to.include('"flag"');
      expect(result.sql).not.to.include("NOT NOT");
    });

    it("should handle boolean field with explicit true/false comparison", () => {
      const result = query(
        () => from<TestTable>("items").where((i) => i.flag === true || i.flag === false),
        {},
      );

      expect(result.sql).to.include('"flag" = ');
      expect(result.params.__p1).to.equal(true);
      expect(result.params.__p2).to.equal(false);
    });

    it("should handle complex boolean algebra", () => {
      const result = query(
        () =>
          from<TestTable>("items").where(
            (i) =>
              (i.flag && i.value !== null && i.value > 0) ||
              (!i.flag && i.value !== null && i.value < 0),
          ),
        {},
      );

      expect(result.sql).to.include("OR");
      expect(result.sql).to.include("AND");
      expect(result.sql).to.include("NOT");
    });
  });

  describe("Date operation edge cases", () => {
    it("should not support external variables (must use params)", () => {
      const testDate = new Date("2024-01-01");
      expect(() => {
        query(() => from<TestTable>("items").where((i) => i.createdAt > testDate), {});
      }).to.throw();

      // Correct way: pass via params
      const result = query(
        (params) => from<TestTable>("items").where((i) => i.createdAt > params.testDate),
        { testDate },
      );
      expect(result.sql).to.include('"createdAt" > $(testDate)');
    });

    it("should not support date arithmetic methods", () => {
      expect(() => {
        query(
          () =>
            from<TestTable>("items").select((i) => ({
              daysSince: (Date.now() - i.createdAt.getTime()) / (1000 * 60 * 60 * 24),
            })),
          {},
        );
      }).to.throw(/Unknown identifier|Unsupported call expression|Failed to parse query/);
    });
  });

  describe("Complex nested operations", () => {
    it("should handle deeply nested arithmetic", () => {
      const result = query(
        () =>
          from<TestTable>("items").where(
            (i) => i.value !== null && ((i.value + 10) * 2 - 5) / 3 > 10,
          ),
        {},
      );

      expect(result.sql).to.include("((");
      expect(result.sql).to.include("+ ");
      expect(result.sql).to.include("* ");
      expect(result.sql).to.include("- ");
      expect(result.sql).to.include("/ ");
    });

    it("should handle nested ternary operations", () => {
      const result = query(
        () =>
          from<TestTable>("items").select((i) => ({
            category:
              i.value !== null
                ? i.value < 10
                  ? "low"
                  : i.value < 50
                    ? "medium"
                    : "high"
                : "unknown",
          })),
        {},
      );

      expect(result.sql).to.include("CASE WHEN");
      expect(result.sql).to.include("THEN");
      expect(result.sql).to.include("ELSE");
    });

    it("should handle nested object projections", () => {
      const result = query(
        () =>
          from<TestTable>("items").select((i) => ({
            data: {
              id: i.id,
              metadata: {
                value: i.value,
                text: i.text ?? "default",
              },
            },
          })),
        {},
      );

      expect(result.sql).to.include("AS ");
    });
  });

  describe("Parameter edge cases", () => {
    it("should handle empty parameter object", () => {
      const result = query(() => from<TestTable>("items"), {});

      expect(result.params).to.deep.equal({});
    });

    it("should handle parameter name collision with auto-params", () => {
      const result = query(
        (params) =>
          from<TestTable>("items")
            .where((i) => i.value !== null && i.value > params.threshold)
            .where((i) => i.value !== null && i.value < 100),
        { threshold: 50 },
      );

      // User param takes priority over auto-param when merged
      expect(result.params.threshold).to.equal(50); // User param preserved
      expect(result.params.__p1).to.equal(100); // Auto-param for literal constant
      expect(result.sql).to.include("$(threshold)"); // User param reference
      expect(result.sql).to.include("$(__p1)"); // Auto-param reference
    });
  });

  describe("SQL injection prevention", () => {
    it("should parameterize dangerous strings", () => {
      const result = query(
        () => from<TestTable>("items").where((i) => i.text === "'; DROP TABLE users; --"),
        {},
      );

      expect(result.sql).not.to.include("DROP TABLE");
      expect(result.params.__p1).to.equal("'; DROP TABLE users; --");
    });

    it("should handle column names that look like SQL", () => {
      interface DangerousTable {
        SELECT: number;
        FROM: string;
        WHERE: boolean;
      }

      const result = query(
        () => from<DangerousTable>("dangerous").select((d) => ({ value: d.SELECT })),
        {},
      );

      expect(result.sql).to.include('"SELECT"');
    });

    it("should parameterize hex strings", () => {
      const result = query(
        () => from<TestTable>("items").where((i) => i.text === "0x1234ABCD"),
        {},
      );

      expect(result.params.__p1).to.equal("0x1234ABCD");
    });
  });

  describe("Type coercion edge cases", () => {
    it("should handle string to number comparison", () => {
      const result = query(() => from<TestTable>("items").where((i) => i.text === "123"), {});

      expect(result.params.__p1).to.be.a("string");
      expect(result.params.__p1).to.equal("123");
    });

    it("should not support expressions without table context in select", () => {
      expect(() => {
        query(
          () =>
            from<TestTable>("items").select(() => ({
              mixed: "prefix" + "_suffix", // No table parameter reference
            })),
          {},
        );
      }).to.throw();

      // Correct way: use table parameter
      const result = query(
        () =>
          from<TestTable>("items").select((i) => ({
            mixed: (i.text ?? "prefix") + "_suffix",
          })),
        {},
      );
      expect(result.sql).to.include("||"); // Should use PostgreSQL string concatenation
    });
  });

  describe("Reserved word edge cases", () => {
    it("should handle all SQL reserved words as column names", () => {
      interface ReservedTable {
        select: number;
        from: string;
        where: boolean;
        group: string;
        order: number;
        having: string;
        limit: number;
        offset: number;
        join: string;
        union: string;
      }

      const result = query(
        () =>
          from<ReservedTable>("reserved")
            .where((r) => r.select > 0)
            .select((r) => ({
              selectCol: r.select,
              fromCol: r.from,
              whereCol: r.where,
            })),
        {},
      );

      expect(result.sql).to.include('"select"');
      expect(result.sql).to.include('"from"');
      expect(result.sql).to.include('"where"');
    });
  });
});
