/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type AuditEntry = {
    audit_id: number;
    occurred_at: string;
    actor: string;
    action: string;
    entity_type: string;
    project_id?: string | null;
    target_id: string;
    outcome: string;
    before_values?: any | null;
    after_values?: any | null;
};

