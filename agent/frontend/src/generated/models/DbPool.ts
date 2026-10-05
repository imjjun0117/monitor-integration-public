/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Identifier } from './Identifier';
import type { Status } from './Status';
export type DbPool = {
    project_id: Identifier;
    instance_id: Identifier;
    pool_id: Identifier;
    name: string;
    active: number | null;
    idle: number | null;
    max_size: number | null;
    min_idle: number | null;
    waiters: number | null;
    max_wait_ms: number | null;
    validation_latency_ms: number | null;
    status: Status;
};

