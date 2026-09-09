import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import proxy from "@/proxy";
import { assertLocalWriteRequest } from "@/lib/authoring/request-security";

function makeRequest(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

describe("local write request security", () => {
  it("allows a same-origin JSON write on loopback", () => {
    expect(() => assertLocalWriteRequest(makeRequest("http://127.0.0.1/api/projects", {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1",
        "content-type": "application/json",
      },
      body: "{}",
    }))).not.toThrow();
  });

  it("allows an explicitly marked originless CLI write on loopback", () => {
    expect(() => assertLocalWriteRequest(makeRequest("http://localhost/api/projects", {
      method: "POST",
      headers: {
        "x-storyforge-cli": "1",
        "content-type": "application/json",
      },
      body: "{}",
    }))).not.toThrow();
  });

  it("rejects an untrusted host or origin", () => {
    expect(() => assertLocalWriteRequest(makeRequest("http://192.168.1.20/api/projects", {
      method: "POST",
      headers: {
        origin: "http://192.168.1.20",
        "content-type": "application/json",
      },
      body: "{}",
    }))).toThrow(/本机|loopback/i);

    expect(() => assertLocalWriteRequest(makeRequest("http://127.0.0.1/api/projects", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "content-type": "application/json",
      },
      body: "{}",
    }))).toThrow(/来源|origin/i);
  });

  it("rejects originless browser-like writes and non-JSON bodies", () => {
    expect(() => assertLocalWriteRequest(makeRequest("http://127.0.0.1/api/projects", {
      method: "POST",
      body: "{}",
    }))).toThrow(/Origin|CLI/i);

    expect(() => assertLocalWriteRequest(makeRequest("http://127.0.0.1/api/projects", {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1",
        "content-type": "text/plain",
      },
      body: "{}",
    }))).toThrow(/JSON/i);
  });

  it("still checks a bodyless write and leaves GET available", async () => {
    expect(() => assertLocalWriteRequest(makeRequest("http://127.0.0.1/api/projects/project-1", {
      method: "DELETE",
      headers: { origin: "http://127.0.0.1" },
    }))).not.toThrow();

    const response = await proxy(new NextRequest("http://192.168.1.20/api/projects"));
    expect(response.status).toBe(200);
  });

  it("enforces the same policy at the Next proxy boundary", async () => {
    const rejected = await proxy(new NextRequest("http://127.0.0.1/api/projects", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "content-type": "application/json",
      },
      body: "{}",
    }));
    expect(rejected.status).toBe(403);
    await expect(rejected.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN" } });

    const accepted = await proxy(new NextRequest("http://127.0.0.1/api/projects", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
      },
      body: "{}",
    }));
    expect(accepted.status).toBe(200);
  });
});
