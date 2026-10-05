/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Identifier } from './Identifier';
import type { Status } from './Status';
export type DashboardInstance = {
    project_id: Identifier;
    instance_id: Identifier;
    display_name: string;
    host_name: string;
    system_cpu_ratio: number | null;
    heap_ratio: number | null;
    /**
     * 서버 RAM 사용률
     */
    physical_memory_ratio?: number | null;
    /**
     * 감시 볼륨 중 가장 높은 사용률
     */
    disk_ratio?: number | null;
    db_pool: string;
    internal_checks: string;
    /**
     * Agent collection connectivity independent of API and internal check results.
     */
    collection_status?: Status;
    last_seen_at: string | null;
    status: Status;
};

