/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { DashboardStatusCause } from './DashboardStatusCause';
export type Incident = {
    incident_id: number;
    project_id: string;
    project_name: string;
    instance_id: string | null;
    instance_name: string | null;
    kind: Incident.kind;
    metric_key: string | null;
    subject_id: string | null;
    subject_name: string | null;
    severity: Incident.severity;
    state: Incident.state;
    opened_at: string;
    last_detected_at: string;
    closed_at: string | null;
    assignee: string | null;
    version: number;
    first_observation: DashboardStatusCause;
    latest_observation: DashboardStatusCause;
};
export namespace Incident {
    export enum kind {
        COLLECTION = 'COLLECTION',
        METRIC = 'METRIC',
        CHECK = 'CHECK',
        CERTIFICATE = 'CERTIFICATE',
    }
    export enum severity {
        WARN = 'WARN',
        DOWN = 'DOWN',
    }
    export enum state {
        OPEN = 'OPEN',
        ACKNOWLEDGED = 'ACKNOWLEDGED',
        IN_PROGRESS = 'IN_PROGRESS',
        RECOVERED = 'RECOVERED',
        MONITORING_STOPPED = 'MONITORING_STOPPED',
    }
}

