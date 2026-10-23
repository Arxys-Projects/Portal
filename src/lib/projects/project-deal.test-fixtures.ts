// Test doubles for project-deal.test.ts: an in-memory stand-in for the slice
// of supabase-js the Step 5 code uses, and a fake Pipedrive behind fetch. The
// real SQL (unique keys, the claim trigger, the ledger CHECK) is proven in
// PGlite against the migrations; these fakes only reproduce the unique keys
// and the conditional updates the code depends on.

import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
type DbError = { message: string; code?: string };
type Op = "select" | "insert" | "upsert" | "update" | "delete";

const same = (a: unknown, b: unknown) => a === b || (a != null && b != null && String(a) === String(b));

export class FakeDb {
  tables: Record<string, Row[]> = {};
  unique: Record<string, string[][]> = {
    project_deal_claims: [["project_id"], ["lineage_root_submission_id"], ["pipedrive_deal_id"]],
    deal_line_syncs: [["pipedrive_deal_id", "sku", "role"]],
    quote_email_sends: [["project_quote_id", "to_email"]],
  };
  // Return an error to make the next matching operation fail.
  failOn: (table: string, op: Op, payload: unknown) => DbError | null = () => null;
  private seq = 1;
  private tick = 0;

  rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }

  stamp(): string {
    return new Date(Date.UTC(2026, 9, 23, 12, 0, 0) + this.tick++).toISOString();
  }

  client(): SupabaseClient {
    return { from: (table: string) => new Query(this, table) } as unknown as SupabaseClient;
  }

  conflicts(table: string, row: Row, ignoreId?: unknown): boolean {
    return (this.unique[table] ?? []).some((cols) =>
      this.rows(table).some(
        (r) => r.id !== ignoreId && cols.every((c) => row[c] != null && same(r[c], row[c])),
      ),
    );
  }

  insertRow(table: string, input: Row): Row {
    const row: Row = { ...input };
    if (["deal_line_syncs", "project_deal_claims", "quote_pricing_confirmations", "quote_email_sends"].includes(table)) row.id = this.seq++;
    if (table === "quote_pricing_confirmations") row.confirmed_at ??= this.stamp();
    if (table === "quote_email_sends") row.created_at ??= this.stamp();
    if (table === "deal_line_syncs") {
      row.updated_at = this.stamp();
      row.error ??= null;
      row.pipedrive_deal_product_id ??= null;
    }
    if (table === "project_deal_claims") {
      row.pipedrive_deal_id ??= null;
      row.claimed_at ??= this.stamp();
    }
    this.rows(table).push(row);
    return row;
  }
}

class Query implements PromiseLike<{ data: unknown; error: DbError | null }> {
  private op: Op = "select";
  private filters: ((r: Row) => boolean)[] = [];
  private payload: unknown;
  private returning = false;
  private mode: "many" | "single" | "maybe" = "many";
  private limitN: number | null = null;
  private orders: { col: string; ascending: boolean }[] = [];
  private ignoreDuplicates = false;

  constructor(
    private db: FakeDb,
    private table: string,
  ) {}

  select(): this {
    if (this.op === "select") this.returning = true;
    else this.returning = true;
    return this;
  }
  insert(rows: unknown): this {
    this.op = "insert";
    this.payload = rows;
    return this;
  }
  upsert(rows: unknown, opts?: { ignoreDuplicates?: boolean }): this {
    this.op = "upsert";
    this.payload = rows;
    this.ignoreDuplicates = opts?.ignoreDuplicates === true;
    return this;
  }
  update(patch: unknown): this {
    this.op = "update";
    this.payload = patch;
    return this;
  }
  delete(): this {
    this.op = "delete";
    return this;
  }
  eq(col: string, value: unknown): this {
    this.filters.push((r) => same(r[col], value));
    return this;
  }
  // Only the form the code uses: .not(col, "is", null).
  not(col: string, _op: "is", _value: null): this {
    this.filters.push((r) => r[col] != null);
    return this;
  }
  is(col: string, value: null): this {
    this.filters.push((r) => (value === null ? r[col] == null : r[col] === value));
    return this;
  }
  in(col: string, values: unknown[]): this {
    this.filters.push((r) => values.some((v) => same(r[col], v)));
    return this;
  }
  or(expr: string): this {
    const parts = expr.split(",").map((p) => {
      const [col, , ...rest] = p.split(".");
      return { col, value: rest.join(".") };
    });
    this.filters.push((r) => parts.some((p) => same(r[p.col], p.value)));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orders.push({ col, ascending: opts?.ascending !== false });
    return this;
  }
  limit(n: number): this {
    this.limitN = n;
    return this;
  }
  single(): this {
    this.mode = "single";
    return this;
  }
  maybeSingle(): this {
    this.mode = "maybe";
    return this;
  }

  then<A = { data: unknown; error: DbError | null }, B = never>(
    onfulfilled?: ((v: { data: unknown; error: DbError | null }) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => this.run())
      .then(onfulfilled, onrejected);
  }

  private match(): Row[] {
    const rows = this.db.rows(this.table).filter((r) => this.filters.every((f) => f(r)));
    if (this.orders.length === 0) return rows;
    return [...rows].sort((a, b) => {
      for (const o of this.orders) {
        const x = a[o.col] as string | number;
        const y = b[o.col] as string | number;
        if (x === y) continue;
        return (x < y ? -1 : 1) * (o.ascending ? 1 : -1);
      }
      return 0;
    });
  }

  private shape(rows: Row[]): { data: unknown; error: DbError | null } {
    const out = rows.map((r) => ({ ...r }));
    if (this.mode === "single") {
      return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { message: "not one row", code: "PGRST116" } };
    }
    if (this.mode === "maybe") return { data: out[0] ?? null, error: null };
    return { data: this.limitN === null ? out : out.slice(0, this.limitN), error: null };
  }

  private run(): { data: unknown; error: DbError | null } {
    const failure = this.db.failOn(this.table, this.op, this.payload);
    if (failure) return { data: null, error: failure };
    const db = this.db;

    if (this.op === "select") return this.shape(this.match());

    if (this.op === "insert" || this.op === "upsert") {
      const input = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      const toWrite: Row[] = [];
      for (const row of input) {
        const clash = db.conflicts(this.table, row) || toWrite.some((w) => (db.unique[this.table] ?? []).some((cols) => cols.every((c) => same(w[c], row[c]))));
        if (clash) {
          if (this.op === "upsert" && this.ignoreDuplicates) continue;
          return { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } };
        }
        toWrite.push(row);
      }
      const written = toWrite.map((r) => db.insertRow(this.table, r));
      return this.returning ? this.shape(written) : { data: null, error: null };
    }

    if (this.op === "update") {
      const rows = this.match();
      const patch = this.payload as Row;
      for (const r of rows) {
        if (db.conflicts(this.table, { ...r, ...patch }, r.id)) {
          return { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } };
        }
      }
      for (const r of rows) {
        Object.assign(r, patch);
        if (this.table === "deal_line_syncs") r.updated_at = db.stamp();
      }
      return this.returning ? this.shape(rows) : { data: null, error: null };
    }

    const rows = this.match();
    db.tables[this.table] = db.rows(this.table).filter((r) => !rows.includes(r));
    return this.returning ? this.shape(rows) : { data: null, error: null };
  }
}

// ---------------------------------------------------------------------------
// Fake Pipedrive
// ---------------------------------------------------------------------------

export type PdProductFixture = { id: number; name: string; code: string | null; is_linkable: boolean; prices: { price: number; currency: string }[] };
export type DealLine = {
  id: number;
  product_id: number;
  item_price: number;
  quantity: number;
  comments: string | null;
  // Step 6: the gate's fingerprint reads these too.
  sum?: number | null;
  discount?: number | null;
  discount_type?: string | null;
  order_nr?: number | null;
};
export type PostFault = "refuse" | "server-error" | "no-response" | "rate-limited" | "written-then-no-response";
export type Call = { method: string; path: string; body: unknown };

export class FakePipedrive {
  products: PdProductFixture[] = [];
  pipelines = [
    { id: 1, name: "Project Pipeline" },
    // A second pipeline whose stage names must not be picked up.
    { id: 7, name: "JCT pipeline" },
  ];
  stages = [
    { id: 11, name: "New Lead", pipeline_id: 1 },
    { id: 71, name: "New Lead", pipeline_id: 7 },
    { id: 72, name: "Quoted", pipeline_id: 7 },
  ];
  dealFields: { field_code: string; field_name: string }[] = [{ field_code: "abc123projectfield", field_name: "arxys_project_id" }];
  deals = new Map<number, { body: Record<string, unknown>; lines: DealLine[] }>();
  calls: Call[] = [];
  // Step 6: page deal lines this many at a time (null: one page).
  linePageSize: number | null = null;
  // Step 6: called before every GET; return a status to fail it.
  onGet: (path: string) => number | null = () => null;
  // Called before every POST; return a fault to inject one.
  onPost: (path: string, body: unknown) => PostFault | null = () => null;
  private nextDeal = 501;
  private nextLine = 9001;

  postsTo(pattern: RegExp): Call[] {
    return this.calls.filter((c) => c.method === "POST" && pattern.test(c.path));
  }

  install(): void {
    globalThis.fetch = (async (input: Request | string | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      const path = url.pathname.replace(/^\/api\/v2/, "/v2").replace(/^\/v1/, "/v1");
      this.calls.push({ method, path: path + url.search, body });
      return this.route(method, path, url, body);
    }) as typeof fetch;
  }

  private json(status: number, payload: unknown, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json", ...headers } });
  }

  private list(data: unknown[]): Response {
    return this.json(200, { success: true, data, additional_data: { next_cursor: null } });
  }

  private route(method: string, path: string, url: URL, body: unknown): Response {
    if (method === "GET") {
      const failStatus = this.onGet(path);
      if (failStatus) return this.json(failStatus, { success: false, error: "Injected failure" });
      if (path === "/v2/products") return this.list(this.products);
      if (path === "/v2/pipelines") return this.list(this.pipelines);
      if (path === "/v2/stages") {
        const pid = Number(url.searchParams.get("pipeline_id"));
        return this.list(this.stages.filter((s) => s.pipeline_id === pid));
      }
      if (path === "/v2/dealFields") return this.list(this.dealFields);
      const lines = /^\/v2\/deals\/(\d+)\/products$/.exec(path);
      if (lines) {
        const all = this.deals.get(Number(lines[1]))?.lines ?? [];
        if (!this.linePageSize) return this.list(all);
        const start = Number(url.searchParams.get("cursor") ?? 0);
        const end = start + this.linePageSize;
        return this.json(200, {
          success: true,
          data: all.slice(start, end),
          additional_data: { next_cursor: end < all.length ? String(end) : null },
        });
      }
      // Partner path (v1), used by resolveOwnerId and resolveStageId.
      if (path === "/v1/users") return this.json(200, { success: true, data: [{ id: 999, name: "Andy Newbom" }] });
      if (path === "/v1/stages") {
        const pid = Number(url.searchParams.get("pipeline_id"));
        return this.json(200, { success: true, data: this.stages.filter((s) => s.pipeline_id === pid) });
      }
      return this.json(404, { success: false, error: `no route GET ${path}` });
    }

    const fault = this.onPost(path, body);
    if (fault === "refuse") return this.json(400, { success: false, error: "Validation failed" });
    if (fault === "server-error") return this.json(502, { success: false, error: "Bad gateway" });
    if (fault === "no-response") throw new TypeError("fetch failed");
    if (fault === "rate-limited") return this.json(429, { success: false, error: "Too many requests" }, { "x-ratelimit-reset": "0.5" });

    if (path === "/v2/deals") {
      const id = this.nextDeal++;
      this.deals.set(id, { body: body as Record<string, unknown>, lines: [] });
      if (fault === "written-then-no-response") throw new TypeError("fetch failed");
      return this.json(201, { success: true, data: { id } });
    }
    const add = /^\/v2\/deals\/(\d+)\/products$/.exec(path);
    if (add) {
      const deal = this.deals.get(Number(add[1]));
      if (!deal) return this.json(404, { success: false, error: "Deal not found" });
      const b = body as { product_id: number; item_price: number; quantity: number; comments: string };
      const line: DealLine = { id: this.nextLine++, product_id: b.product_id, item_price: b.item_price, quantity: b.quantity, comments: b.comments };
      deal.lines.push(line);
      if (fault === "written-then-no-response") throw new TypeError("fetch failed");
      return this.json(201, { success: true, data: line });
    }
    return this.json(404, { success: false, error: `no route POST ${path}` });
  }
}
