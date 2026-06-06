import { entity, role, uuid, text, int, decimal } from '@microsoft/rayfin-core';

// Lead-level facts, materialized from the gold star schema. The dashboard loads
// these and computes every KPI/chart client-side, which is what makes the slicers,
// click-to-filter interactions, and the details table work. reachedMask is a bitmask
// of the stages each lead reached (bit s = stage s), so the funnel ("leads reaching
// each stage") is exact even under a filter.
@entity()
@role('authenticated', ['read'])
export class MetricLead {
  @uuid() id!: string;
  @text({ max: 160 }) customerName!: string;
  @text({ max: 120 }) repName!: string;
  @text({ max: 40 }) showroom!: string;
  @text({ max: 120 }) sourceName!: string;
  @text({ max: 120 }) projectType!: string;
  @text({ max: 20 }) stageName!: string;
  @int() stageOrder!: number;
  @int() reachedMask!: number;
  @decimal() estimatedValue!: number;
  @int() createdDateKey!: number; // YYYYMMDD, for the date-range slicer
  @text({ max: 10 }) yearMonth!: string; // created month, for the trend
  @int() isWon!: number;
  @int() isLost!: number;
  @int() isOpen!: number;
  @int() isStalled!: number;
  @int() daysIdle!: number;
}
