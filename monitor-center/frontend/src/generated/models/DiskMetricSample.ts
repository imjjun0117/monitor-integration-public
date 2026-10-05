/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Identifier } from './Identifier';
import type { Status } from './Status';
export type DiskMetricSample = {
    sampled_at: string;
    project_id: Identifier;
    instance_id: Identifier;
    path_id: Identifier;
    used_bytes: number | null;
    total_bytes: number | null;
    status: Status;
};

