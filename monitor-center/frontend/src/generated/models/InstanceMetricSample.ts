/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Identifier } from './Identifier';
export type InstanceMetricSample = {
    sampled_at: string;
    project_id: Identifier;
    instance_id: Identifier;
    system_cpu_ratio: number | null;
    process_cpu_ratio: number | null;
    heap_used_bytes: number | null;
    heap_max_bytes: number | null;
    non_heap_used_bytes: number | null;
    physical_memory_used_bytes: number | null;
    physical_memory_total_bytes: number | null;
    thread_live_count: number | null;
    thread_peak_count: number | null;
    gc_count: number | null;
    gc_time_ms: number | null;
};

