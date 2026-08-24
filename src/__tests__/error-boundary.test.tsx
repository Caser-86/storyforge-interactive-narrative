// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ErrorBoundary } from "@/components/error-boundary";

function BrokenChild(): never {
  throw new Error("render failed");
}

describe("ErrorBoundary", () => {
  it("offers a same-site link back to the project library", () => {
    render(
      <ErrorBoundary>
        <BrokenChild />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("link", { name: "返回首页" })).toHaveAttribute("href", "/");
  });
});
