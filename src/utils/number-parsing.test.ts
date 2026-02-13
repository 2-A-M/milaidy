import { describe, expect, it } from "vitest";
import {
  parseClampedFloat,
  parsePositiveFloat,
  parsePositiveInteger,
} from "./number-parsing";

describe("number-parsing helpers", () => {
  it("parses positive integers with fallback", () => {
    expect(parsePositiveInteger("3", 1)).toBe(3);
    expect(parsePositiveInteger("12.8", 1)).toBe(12);
    expect(parsePositiveInteger("0019", 1)).toBe(19);
    expect(parsePositiveInteger("0", 4)).toBe(4);
    expect(parsePositiveInteger("-2", 4)).toBe(4);
    expect(parsePositiveInteger("nope", 4)).toBe(4);
    expect(parsePositiveInteger(null, 4)).toBe(4);
    expect(parsePositiveInteger("12abc", 4)).toBe(4);
  });

  it("parses positive floats", () => {
    expect(parsePositiveFloat("0.5")).toBe(0.5);
    expect(parsePositiveFloat("1", { floor: true })).toBe(1);
    expect(parsePositiveFloat(" 2.25 ", { fallback: 0.1 })).toBe(2.25);
    expect(parsePositiveFloat("0", { fallback: 0.1 })).toBe(0.1);
    expect(parsePositiveFloat("bad", { fallback: 0.1 })).toBe(0.1);
  });

  it("parses and clamps floats", () => {
    expect(parseClampedFloat("0.5", { min: 0, max: 1, fallback: 0.2 })).toBe(
      0.5,
    );
    expect(parseClampedFloat("1.4", { min: 0, max: 1, fallback: 0.2 })).toBe(1);
    expect(parseClampedFloat("-0.2", { min: 0, max: 1, fallback: 0.2 })).toBe(
      0,
    );
    expect(parseClampedFloat("bad", { min: 0, max: 1, fallback: 0.2 })).toBe(
      0.2,
    );
  });
});
