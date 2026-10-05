/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { DashboardInstance } from './DashboardInstance';
import type { Identifier } from './Identifier';
import type { Status } from './Status';
export type DashboardProject = {
    project_id: Identifier;
    display_name: string;
    enabled: boolean;
    status: Status;
    instances: Array<DashboardInstance>;
};

