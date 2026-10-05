/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ServiceMetric } from './ServiceMetric';
import type { Status } from './Status';
export type ServiceInfo = {
    title: string;
    description: string;
    dashboard: boolean;
    status: Status;
    collected: number;
    metrics: Array<ServiceMetric>;
};

