import Link from "next/link";

export type SubmissionDetailRow = {
  id: string;
  project_name: string | null;
  cameras_count: number;
  resolution_code: string;
  codec: string;
  complexity: string;
  vms: string | null;
  retention_days: number;
  bandwidth_mbps: number;
  storage_tb: number;
  recommended_units: number;
  total_list_price_usd: number | null;
  total_partner_price_usd: number | null;
  pipedrive_deal_id: number | null;
  created_at: string;
  groups_payload: unknown;
  product: { name: string; description: string | null; sku: string } | null;
};

export type SubmissionPartnerSummary = {
  id: string;
  companyName: string;
  contactName: string;
};

type GroupRow = {
  name?: string;
  cameras?: number;
  resolutionLabel?: string;
  codec?: string;
  complexity?: string;
  fps?: number;
  recordingPercent?: number;
  motionPercent?: number;
  computed?: {
    bandwidthMbps?: number;
    storageGb?: number;
  };
};

function extractGroups(payload: unknown): GroupRow[] {
  if (!payload || typeof payload !== "object") return [];
  const candidate = (payload as { groups?: unknown }).groups;
  if (!Array.isArray(candidate)) return [];
  return candidate as GroupRow[];
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function formatNumber(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPrice(n: number | null | undefined): string {
  if (n === null || n === undefined) return "Pricing TBD";
  return `$${formatNumber(Number(n), 2)}`;
}

export function SubmissionDetail({
  submission,
  partner,
  mode,
}: {
  submission: SubmissionDetailRow;
  partner?: SubmissionPartnerSummary;
  mode: "admin" | "partner";
}) {
  const groups = extractGroups(submission.groups_payload);
  const productLabel = submission.product
    ? `${submission.product.name} (${submission.product.sku})`
    : "—";

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-neutral-900">
          {submission.project_name || "(untitled submission)"}
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          Submitted {formatDate(submission.created_at)} · ID{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs">
            {submission.id}
          </code>
        </p>
        {mode === "admin" && partner ? (
          <p className="mt-1 text-sm text-neutral-700">
            Partner:{" "}
            <Link
              href={`/admin/partners`}
              className="font-medium text-blue-600 hover:underline"
            >
              {partner.companyName}
            </Link>{" "}
            — {partner.contactName}
          </p>
        ) : null}
      </header>

      <section>
        <h2 className="text-base font-semibold text-neutral-900">
          Calculator inputs
        </h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-neutral-100">
              <tr>
                <th className="w-48 bg-neutral-50 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  VMS
                </th>
                <td className="px-4 py-2 text-neutral-800">
                  {submission.vms ?? "—"}
                </td>
              </tr>
              <tr>
                <th className="bg-neutral-50 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Retention (days)
                </th>
                <td className="px-4 py-2 text-neutral-800">
                  {submission.retention_days}
                </td>
              </tr>
              <tr>
                <th className="bg-neutral-50 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Primary resolution
                </th>
                <td className="px-4 py-2 text-neutral-800">
                  {submission.resolution_code}
                </td>
              </tr>
              <tr>
                <th className="bg-neutral-50 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Primary codec / complexity
                </th>
                <td className="px-4 py-2 text-neutral-800">
                  {submission.codec} · {submission.complexity}
                </td>
              </tr>
              <tr>
                <th className="bg-neutral-50 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Totals
                </th>
                <td className="px-4 py-2 text-neutral-800">
                  {formatNumber(submission.cameras_count)} cameras ·{" "}
                  {formatNumber(submission.bandwidth_mbps, 2)} Mbps ·{" "}
                  {formatNumber(submission.storage_tb, 2)} TB
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {groups.length > 0 ? (
        <section>
          <h2 className="text-base font-semibold text-neutral-900">
            Per-group breakdown
          </h2>
          <div className="mt-3 overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-2">Group</th>
                  <th className="px-4 py-2 text-right">Cameras</th>
                  <th className="px-4 py-2">Resolution</th>
                  <th className="px-4 py-2">Codec</th>
                  <th className="px-4 py-2">Complexity</th>
                  <th className="px-4 py-2 text-right">FPS</th>
                  <th className="px-4 py-2 text-right">Rec %</th>
                  <th className="px-4 py-2 text-right">Motion %</th>
                  <th className="px-4 py-2 text-right">Mbps</th>
                  <th className="px-4 py-2 text-right">GB</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {groups.map((g, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 text-neutral-800">
                      {g.name || `Group ${i + 1}`}
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-800">
                      {formatNumber(g.cameras)}
                    </td>
                    <td className="px-4 py-2 text-neutral-700">
                      {g.resolutionLabel ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-neutral-700">{g.codec ?? "—"}</td>
                    <td className="px-4 py-2 text-neutral-700">
                      {g.complexity ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-700">
                      {formatNumber(g.fps)}
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-700">
                      {formatNumber(g.recordingPercent)}
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-700">
                      {formatNumber(g.motionPercent)}
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-700">
                      {formatNumber(g.computed?.bandwidthMbps, 2)}
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-700">
                      {formatNumber(g.computed?.storageGb, 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="text-base font-semibold text-neutral-900">
          Recommendation
        </h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-neutral-100">
              <tr>
                <th className="w-48 bg-neutral-50 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Recommended
                </th>
                <td className="px-4 py-2 text-neutral-800">
                  {submission.recommended_units} × {productLabel}
                </td>
              </tr>
              {submission.product?.description ? (
                <tr>
                  <th className="bg-neutral-50 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Product notes
                  </th>
                  <td className="px-4 py-2 text-neutral-700">
                    {submission.product.description}
                  </td>
                </tr>
              ) : null}
              <tr>
                <th className="bg-neutral-50 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Total list price
                </th>
                <td className="px-4 py-2 text-neutral-800">
                  {formatPrice(submission.total_list_price_usd)}
                </td>
              </tr>
              {mode === "admin" ? (
                <tr>
                  <th className="bg-neutral-50 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Total partner price
                  </th>
                  <td className="px-4 py-2 text-neutral-800">
                    {formatPrice(submission.total_partner_price_usd)}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-3">
        <a
          href={`/api/submissions/${submission.id}/pdf`}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          download
        >
          Download PDF
        </a>
        {mode === "admin" && submission.pipedrive_deal_id ? (
          <a
            href={`https://app.pipedrive.com/deal/${submission.pipedrive_deal_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            Open Pipedrive deal #{submission.pipedrive_deal_id} ↗
          </a>
        ) : null}
        {mode === "admin" && !submission.pipedrive_deal_id ? (
          <span className="text-xs text-neutral-500">
            No Pipedrive deal linked to this submission.
          </span>
        ) : null}
      </section>
    </div>
  );
}
