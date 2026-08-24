import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/conversation/session", () => ({
  sessionExists: vi.fn(),
  loadMessagesPage: vi.fn(),
}));

import { GET } from "@/app/api/chat/sessions/[sessionId]/messages/route";
import {
  loadMessagesPage,
  sessionExists,
} from "@/lib/conversation/session";

const mockedExists = vi.mocked(sessionExists);
const mockedPage = vi.mocked(loadMessagesPage);

describe("GET /api/chat/sessions/[sessionId]/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when session missing", async () => {
    mockedExists.mockResolvedValue(false);
    const res = await GET(
      new Request("http://localhost/api/chat/sessions/x/messages"),
      { params: Promise.resolve({ sessionId: "x" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns page when session exists", async () => {
    mockedExists.mockResolvedValue(true);
    mockedPage.mockResolvedValue({
      messages: [{ id: 1, role: "user", content: "hi" }],
      hasMore: false,
    });
    const res = await GET(
      new Request(
        "http://localhost/api/chat/sessions/abc/messages?limit=20&beforeId=9",
      ),
      { params: Promise.resolve({ sessionId: "abc" }) },
    );
    expect(res.status).toBe(200);
    expect(mockedPage).toHaveBeenCalledWith("abc", {
      limit: 20,
      beforeId: 9,
    });
    const body = await res.json();
    expect(body.messages).toHaveLength(1);
    expect(body.hasMore).toBe(false);
  });
});
