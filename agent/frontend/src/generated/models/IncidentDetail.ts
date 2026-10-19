/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Incident } from './Incident';
import type { IncidentEvent } from './IncidentEvent';
export type IncidentDetail = {
    incident: Incident;
    events: Array<IncidentEvent>;
    assignees: Array<string>;
};

