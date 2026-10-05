/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CheckHistorySample } from './CheckHistorySample';
import type { HttpCheckDetails } from './HttpCheckDetails';
import type { Identifier } from './Identifier';
import type { ServiceInfo } from './ServiceInfo';
import type { ServiceProfile } from './ServiceProfile';
import type { Status } from './Status';
export type Check = {
    project_id: Identifier;
    project_name?: string | null;
    instance_id: Identifier;
    instance_name?: string | null;
    check_id: Identifier;
    name: string;
    category: Check.category;
    /**
     * Central usage preference on this instance. Independent of agent discovery.
     */
    monitoring_enabled?: boolean;
    /**
     * Automatic execution preference. Manual execution is allowed when the check is used.
     */
    automatic_enabled?: boolean;
    /**
     * Effective automatic interval. API defaults are external 24 hours or internal 5 minutes; INTERNAL checks default to 5 minutes.
     */
    check_interval_seconds?: number;
    /**
     * Project and instance enabled; API checks also require the instance API automatic switch.
     */
    automatic_allowed?: boolean;
    direction: ('INTERNAL' | 'EXTERNAL' | null);
    status: Status;
    duration_ms: number | null;
    result_code: string | null;
    message: string | null;
    checked_at: string | null;
    history: Array<CheckHistorySample>;
    http?: (HttpCheckDetails | null);
    service_profile?: (ServiceProfile | null);
    service_info?: (ServiceInfo | null);
    details?: (Record<string, (string | number | boolean | null)> | null);
};
export namespace Check {
    export enum category {
        INTERNAL = 'INTERNAL',
        API = 'API',
    }
}

