/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type IncidentAction = {
    version: number;
    action: IncidentAction.action;
    assignee?: string | null;
    note?: string | null;
};
export namespace IncidentAction {
    export enum action {
        ACKNOWLEDGE = 'ACKNOWLEDGE',
        START = 'START',
        ASSIGN = 'ASSIGN',
        COMMENT = 'COMMENT',
    }
}

