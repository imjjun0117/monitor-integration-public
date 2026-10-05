/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Identifier } from './Identifier';
import type { Status } from './Status';
export type Project = {
    project_id: Identifier;
    display_name: string;
    enabled: boolean;
    status: Status;
    total_instances: number;
    up_instances: number;
    last_seen_at: string | null;
};

