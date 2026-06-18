import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

// Env var must exist before the env module materializes it (lazy accessor).
process.env.PIPEDRIVE_API_TOKEN ??= "test-token";

import { pipedriveClient, PipedriveError } from "./client";

// addDealFile uploads a multipart form, NOT JSON, so this mock captures the raw
// FormData body rather than JSON-parsing it like the deal.test.ts mock does.
type UploadCall = { url: string; method: string; body: unknown };

const calls: UploadCall[] = [];
let respond: () => { status: number; payload: unknown } = () => ({
  status: 200,
  payload: { success: true, data: { id: 4242, name: "quote.pdf", deal_id: 4822 } },
});

const realFetch = globalThis.fetch;

function installFetchMock(): void {
  globalThis.fetch = (async (input: Request | string | URL, init?: RequestInit) => {
    const urlStr =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url: urlStr, method: init?.method ?? "GET", body: init?.body });
    const { status, payload } = respond();
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

describe("pipedriveClient.addDealFile", () => {
  beforeEach(() => {
    calls.length = 0;
    respond = () => ({
      status: 200,
      payload: { success: true, data: { id: 4242, name: "quote.pdf", deal_id: 4822 } },
    });
    installFetchMock();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("POSTs a multipart form to /v1/files with the token, deal_id, and file", async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    const result = await pipedriveClient.addDealFile(4822, "Arxys Project Quote.pdf", bytes);

    assert.equal(calls.length, 1);
    const call = calls[0];
    assert.equal(call.method, "POST");

    const url = new URL(call.url);
    assert.equal(url.pathname, "/v1/files");
    assert.equal(url.searchParams.get("api_token"), process.env.PIPEDRIVE_API_TOKEN);

    // The body is a FormData (multipart), not a JSON string. fetch sets the
    // boundary Content-Type itself, so we must not pass a JSON body here.
    assert.ok(call.body instanceof FormData, "body should be FormData");
    const form = call.body as FormData;
    assert.equal(form.get("deal_id"), "4822");
    const file = form.get("file");
    assert.ok(file instanceof Blob, "file part should be a Blob/File");
    assert.equal((file as File).name, "Arxys Project Quote.pdf");

    // Returns the parsed `data` envelope payload.
    assert.deepEqual(result, { id: 4242, name: "quote.pdf", deal_id: 4822 });
  });

  it("throws PipedriveError when the envelope reports success:false", async () => {
    respond = () => ({
      status: 200,
      payload: { success: false, error: "deal not found", error_info: "no such deal" },
    });
    await assert.rejects(
      () => pipedriveClient.addDealFile(99, "x.pdf", new Uint8Array([1])),
      (err: unknown) => {
        assert.ok(err instanceof PipedriveError);
        assert.equal((err as PipedriveError).message, "deal not found");
        assert.equal((err as PipedriveError).errorInfo, "no such deal");
        return true;
      },
    );
  });

  it("throws PipedriveError on a non-2xx HTTP status", async () => {
    respond = () => ({ status: 403, payload: { success: false, error: "forbidden" } });
    await assert.rejects(
      () => pipedriveClient.addDealFile(99, "x.pdf", new Uint8Array([1])),
      (err: unknown) => {
        assert.ok(err instanceof PipedriveError);
        assert.equal((err as PipedriveError).status, 403);
        return true;
      },
    );
  });
});
