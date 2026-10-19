/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { IncidentChange } from './IncidentChange';
import type { IncidentCheck } from './IncidentCheck';
import type { IncidentLog } from './IncidentLog';
import type { IncidentResource } from './IncidentResource';
export type IncidentEvidence = {
    from: string;
    to: string;
    logs_allowed: boolean;
    changes_allowed: boolean;
    resources: Array<IncidentResource>;
    checks: Array<IncidentCheck>;
    logs: Array<IncidentLog>;
    changes: Array<IncidentChange>;
};

