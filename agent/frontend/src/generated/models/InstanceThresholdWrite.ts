/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { InstanceThresholdMetricKey } from './InstanceThresholdMetricKey';
import type { RecipientEmails } from './RecipientEmails';
export type InstanceThresholdWrite = {
    recipientEmails: RecipientEmails;
    metrics: Array<{
        metricKey: InstanceThresholdMetricKey;
        warningValue: number;
        criticalValue: number;
        useDefault: boolean;
        recipientEmails: RecipientEmails;
        certificateTargetId?: number | null;
    }>;
};

