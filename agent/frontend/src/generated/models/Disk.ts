/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Identifier } from './Identifier';
import type { Status } from './Status';
export type Disk = {
    project_id: Identifier;
    instance_id: Identifier;
    path_id: Identifier;
    path_display: string;
    used_bytes: number | null;
    total_bytes: number | null;
    status: Status;
};

