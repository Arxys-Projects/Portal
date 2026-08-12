"use client";

// Quick Project Calculation & Quote form (ADR 0082). Six user inputs; the
// camera group is pinned to the Arxys VSR standard (QUICK_CALC_GROUP). The
// recommendation preview runs server-side (same engine + SKU pool as the full
// calculator); saving calls the full calculator's submitCalculation, so the
// submission, Pipedrive deal, and System Estimate PDF pipeline are identical.

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Button, Select } from "@/app/(app)/_components/ui";
import { VMS_OPTIONS } from "@/lib/calculator/tables";
import {
  QUICK_CALC_GROUP,
  QUICK_CALC_ASSUMPTIONS,
  QUICK_CALC_UTILIZATION_PCT,
} from "@/lib/calculator/quick-calc";
import { submitCalculation, type SubmissionState } from "@/app/(app)/calculator/actions";
import type { OnBehalfPartner } from "@/app/(app)/calculator/calculator-form";
import { quickCalcPreview, type QuickCalcPreview } from "./actions";

type Props = {
  isInternal: boolean;
  onBehalfPartners: OnBehalfPartner[];
  ownCompanyName: string | null;
  ownContactName: string | null;
};

function fmtUsd(n: number): string {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.05em] text-[#8b929b]"
    >
      {children}
    </label>
  );
}

export function QuickCalcForm({
  isInternal,
  onBehalfPartners,
  ownCompanyName,
  ownContactName,
}: Props) {
  // Partner block (internal users only — mirrors the full calculator).
  const [company, setCompany] = useState("");
  const [partnerUserId, setPartnerUserId] = useState("");
  const [showNewCompany, setShowNewCompany] = useState(false);
  const [newCompany, setNewCompany] = useState("");

  // The six inputs.
  const [projectName, setProjectName] = useState("");
  const [vms, setVms] = useState("");
  const [camerasRaw, setCamerasRaw] = useState("");
  const [retentionRaw, setRetentionRaw] = useState("30");
  const [addOnFailoverRecorder, setAddOnFailoverRecorder] = useState(false);
  const [addOnManagementServer, setAddOnManagementServer] = useState(false);

  // Preview + save state.
  const [preview, setPreview] = useState<QuickCalcPreview | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [submitState, setSubmitState] = useState<SubmissionState>({ status: "idle" });
  const [isSaving, startSave] = useTransition();
  const previewSeq = useRef(0);

  const cameras = parseInt(camerasRaw, 10);
  const retentionDays = parseInt(retentionRaw, 10);
  const sizingValid =
    !Number.isNaN(cameras) &&
    cameras >= 1 &&
    cameras <= 9999 &&
    !Number.isNaN(retentionDays) &&
    retentionDays >= 1 &&
    retentionDays <= 730;

  const companies = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const p of onBehalfPartners) {
      if (p.companyName && !seen.has(p.companyName)) {
        seen.add(p.companyName);
        list.push(p.companyName);
      }
    }
    return list;
  }, [onBehalfPartners]);

  const usersForCompany = useMemo(
    () => onBehalfPartners.filter((p) => p.companyName === company),
    [onBehalfPartners, company],
  );

  // Debounced server-side preview whenever the sizing inputs are valid. The
  // seq counter drops stale responses; render gates on sizingValid so an
  // out-of-date preview object is never shown.
  useEffect(() => {
    if (!sizingValid) return;
    const seq = ++previewSeq.current;
    const t = setTimeout(async () => {
      if (previewSeq.current !== seq) return;
      setPreviewPending(true);
      const result = await quickCalcPreview({ cameras, retentionDays });
      if (previewSeq.current === seq) {
        setPreview(result);
        setPreviewPending(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [cameras, retentionDays, sizingValid]);

  const onBehalfChosen = showNewCompany
    ? newCompany.trim().length > 0
    : partnerUserId.length > 0;
  const canSave =
    sizingValid &&
    preview?.status === "ok" &&
    !isSaving &&
    submitState.status !== "ok" &&
    (!isInternal || onBehalfChosen);

  function handleCompanyChange(next: string) {
    setCompany(next);
    const users = onBehalfPartners.filter((p) => p.companyName === next);
    setPartnerUserId(users.length === 1 ? users[0].id : "");
  }

  function handleSave() {
    if (!canSave) return;
    startSave(async () => {
      const payload = {
        projectName: projectName.trim() || null,
        onBehalfOfPartnerId:
          isInternal && !showNewCompany ? partnerUserId || null : null,
        onBehalfOfCompanyName:
          isInternal && showNewCompany ? newCompany.trim() || null : null,
        vms: vms || null,
        retentionDays,
        // Quick Calc is a fixed standard — the Max disk utilization slider is
        // not exposed, so the save pins the same 80% the preview used
        // (ADR 0082 + 0126). Preview and saved estimate must never diverge, so
        // both read this one constant.
        utilizationPct: QUICK_CALC_UTILIZATION_PCT,
        groups: [{ ...QUICK_CALC_GROUP, cameras }],
        addOnFailoverRecorder,
        addOnManagementServer,
        isRevision: false,
        sourceSubmissionId: null,
      };
      const result = await submitCalculation({ status: "idle" }, payload);
      setSubmitState(result);
    });
  }

  const winner = preview?.status === "ok" ? preview.winner : null;

  return (
    <div>
      {/* Project card */}
      <div className="mt-5 rounded-[14px] border border-line bg-surface px-5 py-5">
        <p className="mb-3.5 text-[12.5px] font-bold uppercase tracking-[0.1em] text-[#222c3a]">
          Project
        </p>

        {isInternal ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="qc-company">Company</FieldLabel>
                <Select
                  id="qc-company"
                  value={company}
                  onChange={(e) => handleCompanyChange(e.target.value)}
                  disabled={showNewCompany}
                >
                  <option value="">— Select —</option>
                  {companies.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <FieldLabel htmlFor="qc-partner-user">Partner user</FieldLabel>
                <Select
                  id="qc-partner-user"
                  value={partnerUserId}
                  onChange={(e) => setPartnerUserId(e.target.value)}
                  disabled={showNewCompany || !company}
                >
                  <option value="">— Select —</option>
                  {usersForCompany.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.contactName || p.email || p.id}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowNewCompany((v) => !v);
                setCompany("");
                setPartnerUserId("");
                setNewCompany("");
              }}
              className="mt-2 inline-block text-[12.5px] font-medium text-arxys-navy hover:underline"
            >
              {showNewCompany
                ? "← Back to onboarded companies"
                : "+ Company not onboarded? Add a new name"}
            </button>
            {showNewCompany ? (
              <div className="mt-2.5">
                <FieldLabel htmlFor="qc-new-company">New company name</FieldLabel>
                <input
                  id="qc-new-company"
                  type="text"
                  maxLength={120}
                  value={newCompany}
                  onChange={(e) => setNewCompany(e.target.value)}
                  placeholder="Company name"
                  className="h-[42px] w-full rounded-lg border border-[#b9c4d5] px-3 text-sm text-ink outline-none transition-colors focus:border-arxys-navy"
                />
              </div>
            ) : null}
          </>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel>Company</FieldLabel>
              <p className="flex h-[42px] items-center rounded-lg border border-line-soft bg-panel px-3 text-sm text-ink">
                {ownCompanyName ?? "—"}
              </p>
            </div>
            <div>
              <FieldLabel>Partner user</FieldLabel>
              <p className="flex h-[42px] items-center rounded-lg border border-line-soft bg-panel px-3 text-sm text-ink">
                {ownContactName ?? "—"}
              </p>
            </div>
          </div>
        )}

        <div className="mt-4">
          <FieldLabel htmlFor="qc-project-name">Project name</FieldLabel>
          <input
            id="qc-project-name"
            type="text"
            maxLength={50}
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="e.g. Main Campus"
            className="h-[42px] w-full rounded-lg border border-[#b9c4d5] px-3 text-sm text-ink outline-none transition-colors focus:border-arxys-navy"
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1.3fr_1fr_1fr]">
          <div>
            <FieldLabel htmlFor="qc-vms">Which VMS?</FieldLabel>
            <Select
              id="qc-vms"
              value={vms}
              onChange={(e) => setVms(e.target.value)}
            >
              <option value="">— Select —</option>
              {VMS_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="qc-cameras">Camera streams</FieldLabel>
            <input
              id="qc-cameras"
              type="number"
              min={1}
              max={9999}
              step={1}
              inputMode="numeric"
              value={camerasRaw}
              onChange={(e) => setCamerasRaw(e.target.value)}
              placeholder="e.g. 120"
              className="h-[42px] w-full rounded-lg border border-[#b9c4d5] px-3 text-sm text-ink outline-none transition-colors focus:border-arxys-navy"
            />
          </div>
          <div>
            <FieldLabel htmlFor="qc-retention">Retention (days)</FieldLabel>
            <input
              id="qc-retention"
              type="number"
              min={1}
              max={730}
              step={1}
              inputMode="numeric"
              value={retentionRaw}
              onChange={(e) => setRetentionRaw(e.target.value)}
              className="h-[42px] w-full rounded-lg border border-[#b9c4d5] px-3 text-sm text-ink outline-none transition-colors focus:border-arxys-navy"
            />
          </div>
        </div>

        <div className="mt-4.5">
          <FieldLabel>Add-ons</FieldLabel>
          <div className="flex flex-wrap gap-6 text-sm text-ink">
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={addOnFailoverRecorder}
                onChange={(e) => setAddOnFailoverRecorder(e.target.checked)}
                className="h-4 w-4 accent-[#14346b]"
              />
              Failover Recorder
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={addOnManagementServer}
                onChange={(e) => setAddOnManagementServer(e.target.checked)}
                className="h-4 w-4 accent-[#14346b]"
              />
              Management Server
            </label>
          </div>
        </div>
      </div>

      {/* Fixed assumptions — read-only VSR standard strip */}
      <div className="mt-3.5 rounded-[14px] border border-line bg-panel px-5 py-4.5">
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <span className="text-[12.5px] font-bold uppercase tracking-[0.08em] text-[#222c3a]">
            Fixed assumptions — Arxys VSR standard
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-ink-soft">
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
            >
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            read-only
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_CALC_ASSUMPTIONS.map((pill) => (
            <span
              key={pill}
              className="rounded-full border border-[#dde2e8] bg-surface px-3 py-1 text-[12.5px] text-ink-soft"
            >
              {pill}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-soft">
          These drive the sizing and print on the System Estimate so the basis
          is visible — they can&apos;t be edited here. Need to change them? Use
          the full Calculator.
        </p>
      </div>

      {/* Recommended configuration result card */}
      <div className="mt-3.5 flex flex-wrap items-center gap-6 rounded-[14px] border border-line border-t-[3px] border-t-arxys-navy bg-surface px-5 py-5">
        <div className="min-w-[280px] flex-1">
          <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#3f4b5b]">
            Recommended configuration
          </p>
          {!sizingValid ? (
            <p className="text-sm text-ink-soft">
              Enter camera streams and retention to size the system.
            </p>
          ) : previewPending ? (
            <p className="text-sm text-ink-soft">Sizing…</p>
          ) : preview?.status === "error" ? (
            <p className="text-sm text-danger">{preview.error}</p>
          ) : winner ? (
            <>
              <p className="text-[22px] font-extrabold text-arxys-navy">
                {winner.units} × {winner.productGroup}
              </p>
              <p className="mt-1 text-[13px] text-ink-soft">
                {winner.productName} · sized for {preview!.status === "ok" ? preview!.totals.cameras : cameras}{" "}
                streams on the VSR standard
              </p>
              <p className="mt-2.5 text-[13px] text-ink">
                <span className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#3f4b5b]">
                  Total list price
                </span>{" "}
                <span className="text-lg font-extrabold tabular-nums text-ink">
                  {fmtUsd(winner.totalCostUsd)}
                </span>
              </p>
              {preview!.status === "ok" && preview!.warnings.length > 0 ? (
                <p className="mt-2 text-xs text-ink-soft">
                  {preview!.warnings.join(" ")}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-ink-soft">
              Enter camera streams and retention to size the system.
            </p>
          )}
        </div>
        <div className="flex flex-col items-start gap-2.5 sm:items-end">
          <Button onClick={handleSave} disabled={!canSave}>
            {isSaving
              ? "Saving…"
              : submitState.status === "ok"
                ? "Saved ✓"
                : "Save & request quote"}
          </Button>
          <Link
            href="/calculator"
            className="text-[12.5px] font-medium text-arxys-navy hover:underline"
          >
            Need per-camera detail? Open the full Calculator →
          </Link>
        </div>

        {isInternal && !onBehalfChosen ? (
          <p className="w-full text-xs text-ink-soft">
            Internal submissions need a partner target — pick a company and
            user, or add a not-yet-onboarded company name.
          </p>
        ) : null}

        {submitState.status === "error" ? (
          <p className="w-full rounded-lg border border-[#f0c6c2] bg-danger-soft px-3 py-2 text-sm text-danger">
            {submitState.error}
          </p>
        ) : null}
        {submitState.status === "ok" ? (
          <p className="w-full rounded-lg border border-[#b6ddc6] bg-[#e7f4ec] px-3 py-2 text-sm text-[#136340]">
            Estimate saved and sent to Arxys.{" "}
            <a
              href={`/api/submissions/${submitState.submissionId}/pdf`}
              className="font-semibold underline"
            >
              View report PDF
            </a>{" "}
            — it&apos;s also in{" "}
            <Link href="/submissions" className="font-semibold underline">
              My Pipeline
            </Link>
            .
          </p>
        ) : null}
      </div>
    </div>
  );
}
