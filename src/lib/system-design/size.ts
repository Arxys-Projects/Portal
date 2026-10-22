import { recommend } from "@/lib/recommend/algorithm";
import {
  recommendFailover,
  type FailoverGroupLoad,
  type FailoverRecommendation,
} from "@/lib/recommend/failover";
import type { RecommendationInput, RecommendationResult, ServerSpec } from "@/lib/recommend/types";
import { buildBom, type BomLine } from "./bom";
import { dedicatedManagementSuggestion, type ResolvedSystemDesign } from "./resolve";
import type { DesignRulesSnapshot, SystemDesignValues } from "./rules";

// sizeProjectDesign (ADR 0158). Pure: no I/O.
//
// The one chain a project calc runs once resolveSystemDesign has succeeded:
// size the primary with excludeOneU = SFP+, size the failover from the SAME
// specs and options, build the BOM from the snapshot's rules, and gather every
// warning. Step 4 calls this instead of repeating the glue, so the code that
// ships is the code under test, and the 1U exclusion cannot reach only one of
// the two recommenders.
//
// A thrown sizing error (an empty pool, bad input) comes back as ok: false, so
// the save can show it instead of failing with a 500.

// Banked with every project calc (submission_system_designs.engine_version).
// Bump it when resolveSystemDesign, sizeProjectDesign or buildBom would give a
// different design or BOM for the same inputs, rules and pool, so a banked row
// says which engine built it. The date is the Step 3 engines' (ADRs 0158 to 0163).
export const SYSTEM_DESIGN_ENGINE_VERSION = "2026-10-19";

export type ProjectSizingInput = {
  resolution: {
    design: ResolvedSystemDesign;
    values: SystemDesignValues;
    snapshot: DesignRulesSnapshot;
    warnings: string[];
  };
  // The calc's totals, exactly as the partner path passes them to recommend().
  totals: RecommendationInput;
  // Each computed group's storageGb and resolved retention.
  groups: readonly FailoverGroupLoad[];
  // The candidate pool, loaded with rack_units for SFP+.
  specs: readonly ServerSpec[];
};

export type ProjectSizing =
  | {
      ok: true;
      primary: RecommendationResult;
      // null when failover is off.
      failover: FailoverRecommendation | null;
      bom: BomLine[];
      // Resolution, primary, failover and management advice, in that order.
      warnings: string[];
    }
  | { ok: false; error: string };

export function sizeProjectDesign(input: ProjectSizingInput): ProjectSizing {
  try {
    const { design, snapshot } = input.resolution;
    // The failover default came from the resolution's longest retention, and the
    // failover's daily load comes from these groups: they must be the same groups.
    if (input.groups.length === 0) throw new Error("sizeProjectDesign(): no camera groups");
    const longest = Math.max(...input.groups.map((g) => g.retentionDays));
    if (longest !== design.longestRetentionDays) {
      throw new Error(
        `sizeProjectDesign(): the groups' longest retention (${longest}) differs from the resolved ` +
          `design's (${design.longestRetentionDays}); resolve and size from the same groups`,
      );
    }
    const options = { excludeOneU: design.sfp };
    const primary = recommend(input.totals, input.specs, options);
    const failover = design.failover.enabled
      ? recommendFailover(
          primary.winner,
          input.groups,
          design.failover.days,
          design.failover.primariesPerFailover,
          input.specs,
          options,
        )
      : null;
    const bom = buildBom({
      primary: primary.winner,
      failover: failover?.choice ?? null,
      management: design.management,
      gpu: design.gpu,
      sfp: design.sfp,
      workstations: design.workstations,
      bomRules: snapshot.bomRules,
    });
    const suggestion = dedicatedManagementSuggestion(
      input.resolution,
      primary.winner.units,
      failover?.choice?.units ?? 0,
    );
    return {
      ok: true,
      primary,
      failover,
      bom,
      warnings: [
        ...input.resolution.warnings,
        ...primary.warnings,
        ...(failover?.warnings ?? []),
        ...(suggestion ? [suggestion] : []),
      ],
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
