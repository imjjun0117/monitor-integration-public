/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Check } from './Check';
import type { DashboardHistory } from './DashboardHistory';
import type { DashboardProject } from './DashboardProject';
import type { DashboardStatusCause } from './DashboardStatusCause';
export type Dashboard = {
    projects: Array<DashboardProject>;
    failed_api_count: number;
    expiring_certificate_count: number;
    history: DashboardHistory;
    status_causes: Array<DashboardStatusCause>;
    /**
     * Configured service information for enabled projects, instances and used API checks. Cards read operator-selected SDK details or complete successful JSON responses. Missing values remain uncollected; service warnings are separate from API execution status.
     */
    service_balances?: Array<Check>;
};

