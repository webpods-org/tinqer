import { describe, it } from "mocha";
import { expect } from "chai";
import { query } from "../dist/index.js";
import { from } from "@webpods/tinqer";

describe("Skip SQL Generation", () => {
  interface User {
    id: number;
    name: string;
    age: number;
  }

  it("should generate OFFSET clause", () => {
    const result = query(() => from<User>("users").skip(10), {});

    expect(result.sql).to.equal('SELECT * FROM "users" AS "t0" OFFSET $(__p1)');
    expect(result.params).to.deep.equal({ __p1: 10 });
  });

  it("should combine skip with take for pagination", () => {
    const result = query(() => from<User>("users").skip(20).take(10), {});

    expect(result.sql).to.equal('SELECT * FROM "users" AS "t0" LIMIT $(__p2) OFFSET $(__p1)');
    expect(result.params).to.deep.equal({ __p2: 10, __p1: 20 });
  });

  it("should combine skip with where and orderBy", () => {
    const result = query(
      () =>
        from<User>("users")
          .where((u) => u.age >= 21)
          .orderBy((u) => u.name)
          .skip(5),
      {},
    );

    expect(result.sql).to.equal(
      'SELECT * FROM "users" AS "t0" WHERE "age" >= $(__p1) ORDER BY "name" ASC OFFSET $(__p2)',
    );
    expect(result.params).to.deep.equal({ __p1: 21, __p2: 5 });
  });

  it("should throw error when using local variables", () => {
    const pageSize = 25;
    const pageNumber = 3; // 0-based

    // Local variables should NOT work - parser should return null and throw error
    expect(() => {
      query(
        () =>
          from<User>("users")
            .orderBy((u) => u.id)
            .skip(pageNumber * pageSize)
            .take(pageSize),
        {},
      );
    }).to.throw(/Unknown identifier|Failed to parse query/);
  });
});
