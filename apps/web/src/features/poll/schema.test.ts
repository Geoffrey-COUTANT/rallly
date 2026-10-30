import { describe, expect, it } from "vitest";
import { pollOptionCapacitySchema } from "./schema";

describe("pollOptionCapacitySchema", () => {
  it.each([null, 1, 25, 10000])("accepts %s", (value) => {
    expect(pollOptionCapacitySchema.safeParse(value).success).toBe(true);
  });
  it.each([
    0,
    -1,
    1.5,
    10001,
    "2",
    undefined,
    Number.NaN,
  ])("rejects %s", (value) => {
    expect(pollOptionCapacitySchema.safeParse(value).success).toBe(false);
  });
});
