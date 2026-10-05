/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Disk } from './Disk';
import type { DiskMetricSample } from './DiskMetricSample';
import type { InstanceMetricSample } from './InstanceMetricSample';
import type { MetricLatest } from './MetricLatest';
export type ResourceResponse = {
    latest: MetricLatest;
    history: Array<InstanceMetricSample>;
    disks: Array<Disk>;
    disk_history: Array<DiskMetricSample>;
    stale: boolean;
};

