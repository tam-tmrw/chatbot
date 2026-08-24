import { afterEach, describe, expect, it } from "vitest";
import { parseManyChatBody, toDynamicBlock } from "@/lib/channels/manychat";

describe("parseManyChatBody", () => {
  it("reads id + last_input_text", () => {
    const r = parseManyChatBody({
      id: "mc_99",
      last_input_text: "Xin chào",
    });
    expect(r).toEqual({
      ok: true,
      value: {
        channel: "messenger",
        channelUserId: "mc_99",
        text: "Xin chào",
      },
    });
  });

  it("accepts user_id alias and trims/clips text", () => {
    const r = parseManyChatBody({
      user_id: "u1",
      text: `  hi ${"x".repeat(2100)}`,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.channelUserId).toBe("u1");
      expect(r.value.text.length).toBe(2000);
    }
  });

  it("fails missing user or empty text", () => {
    expect(parseManyChatBody({ last_input_text: "hi" })).toEqual({
      ok: false,
      reason: "missing_user",
    });
    expect(parseManyChatBody({ id: "u1", last_input_text: "   " })).toEqual({
      ok: false,
      reason: "empty_text",
    });
  });
});

describe("toDynamicBlock", () => {
  const prev = { ...process.env };
  afterEach(() => {
    process.env = { ...prev };
  });

  it("returns v2 text and callback when env set", () => {
    process.env.PUBLIC_BASE_URL = "https://demo.example";
    process.env.MANYCHAT_CALLBACK_SECRET = "s3cret";
    const block = toDynamicBlock("**Hello**");
    expect(block.version).toBe("v2");
    expect(block.content.messages).toEqual([{ type: "text", text: "Hello" }]);
    expect(block.content.quick_replies).toEqual([]);
    expect(block.content.external_message_callback).toEqual({
      url: "https://demo.example/api/manychat/callback",
      method: "post",
      headers: { "x-manychat-secret": "s3cret" },
      payload: {
        id: "{{user_id}}",
        last_input_text: "{{last_input_text}}",
      },
      timeout: 86400,
    });
  });

  it("omits callback when PUBLIC_BASE_URL missing", () => {
    delete process.env.PUBLIC_BASE_URL;
    process.env.MANYCHAT_CALLBACK_SECRET = "s3cret";
    const block = toDynamicBlock("hi");
    expect(block.content.external_message_callback).toBeUndefined();
  });

  it("maps multiple texts to multiple messages", () => {
    process.env.PUBLIC_BASE_URL = "https://demo.example";
    process.env.MANYCHAT_CALLBACK_SECRET = "s3cret";
    const block = toDynamicBlock(["**a**", "b"]);
    expect(block.content.messages).toEqual([
      { type: "text", text: "a" },
      { type: "text", text: "b" },
    ]);
  });
});
