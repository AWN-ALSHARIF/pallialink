import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDiscardConfirmation } from "../components/unsaved-changes";

describe("local unsaved form dismissal", () => {
  it("does not discard dirty edits until explicitly confirmed", () => {
    const action = vi.fn();
    const { result } = renderHook(() => useDiscardConfirmation());
    act(() => result.current.request(true, action));
    expect(action).not.toHaveBeenCalled();
    act(() => result.current.cancel());
    expect(action).not.toHaveBeenCalled();
    expect(result.current.pending).toBeNull();
    act(() => result.current.request(true, action));
    act(() => result.current.confirm());
    expect(action).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBeNull();
  });
  it("allows dismissing an unchanged form without a warning", () => {
    const action = vi.fn();
    const { result } = renderHook(() => useDiscardConfirmation());
    act(() => result.current.request(false, action));
    expect(action).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBeNull();
  });
});