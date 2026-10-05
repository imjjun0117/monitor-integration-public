/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Identifier } from './Identifier';
/**
 * Per-project hourly maximum usage in the last 24 hours, including null buckets for missing samples. Disabled projects and instances are excluded.
 */
export type DashboardResourceSample = {
    project_id: Identifier;
    sampled_at: string;
    system_cpu_ratio: number | null;
    heap_ratio: number | null;
    physical_memory_ratio: number | null;
    disk_ratio: number | null;
};

