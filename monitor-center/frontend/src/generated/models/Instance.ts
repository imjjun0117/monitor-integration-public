/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Identifier } from './Identifier';
import type { Status } from './Status';
export type Instance = {
    project_id: Identifier;
    project_name?: string | null;
    instance_id: Identifier;
    instance_name?: string | null;
    display_name: string;
    environment: string | null;
    host_name: string | null;
    agent_base_url: string;
    api_checks_enabled: boolean;
    poll_interval_seconds: number;
    enabled: boolean;
    status: Status;
    system_cpu_ratio: number | null;
    heap_ratio: number | null;
    db_pool: string | null;
    internal_checks: string | null;
    last_seen_at: string | null;
};

