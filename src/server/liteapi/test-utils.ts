import { vi } from "vitest";
import type { FetchLike } from "./client";

type Reply = { status?: number; body: unknown } | Error;

/** Fake fetch for tests: replies in order, records calls. Never touches the network. */
export function fakeFetch(...replies: Reply[]) {
  const queue = [...replies];
  return vi.fn<FetchLike>(async (url) => {
    const reply = queue.shift();
    if (!reply) throw new Error(`Unexpected fetch: ${url}`);
    if (reply instanceof Error) throw reply;
    const text = typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body);
    return new Response(text, { status: reply.status ?? 200 });
  });
}

export const ok = (body: unknown) => ({ status: 200, body });
