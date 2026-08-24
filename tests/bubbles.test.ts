import { describe, expect, it } from "vitest";
import { MAX_BUBBLES, parseBubbles } from "@/lib/conversation/bubbles";

describe("parseBubbles", () => {
  it("parses 1–3 JSON bubbles", () => {
    expect(parseBubbles('{"bubbles":["a"]}')).toEqual(["a"]);
    expect(parseBubbles('{"bubbles":["a","b"]}')).toEqual(["a", "b"]);
    expect(parseBubbles('{"bubbles":["a","b","c"]}')).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("clamps to MAX_BUBBLES and merges overflow", () => {
    const raw = JSON.stringify({
      bubbles: ["1", "2", "3", "4", "5"],
    });
    expect(parseBubbles(raw)).toEqual(["1", "2", "3 4 5"]);
    expect(parseBubbles(raw).length).toBe(MAX_BUBBLES);
  });

  it("splits bubbles on newlines then clamps", () => {
    expect(
      parseBubbles('{"bubbles":["a\\nb","c"]}' ),
    ).toEqual(["a", "b", "c"]);
    expect(
      parseBubbles('{"bubbles":["one\\ntwo\\nthree\\nfour"]}' ),
    ).toEqual(["one", "two", "three four"]);
  });

  it("drops empty strings", () => {
    expect(parseBubbles('{"bubbles":["hi","","there"]}')).toEqual([
      "hi",
      "there",
    ]);
  });

  it("falls back to plain text", () => {
    expect(parseBubbles("Hello plain")).toEqual(["Hello plain"]);
    expect(parseBubbles("**bold** hi")).toEqual(["**bold** hi"]);
    expect(parseBubbles("line1\n\nline2")).toEqual(["line1", "line2"]);
  });

  it("parses fenced JSON", () => {
    expect(
      parseBubbles('```json\n{"bubbles":["xin chào"]}\n```'),
    ).toEqual(["xin chào"]);
  });

  it("falls back on junk JSON", () => {
    expect(parseBubbles("{not json")).toEqual(["{not json"]);
    expect(parseBubbles('{"bubbles":[1,2]}')).toEqual(['{"bubbles":[1,2]}']);
  });
});
