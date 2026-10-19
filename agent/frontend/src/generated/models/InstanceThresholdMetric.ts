/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { InstanceThresholdMetricKey } from './InstanceThresholdMetricKey';
import type { RecipientEmails } from './RecipientEmails';
export type InstanceThresholdMetric = {
    metricKey: InstanceThresholdMetricKey;
    warningValue: number;
    criticalValue: number;
    defaultWarningValue: number;
    defaultCriticalValue: number;
    useDefault: boolean;
    recipientEmails: RecipientEmails;
    certificateTargetId?: number | null;
    certificateTargetLabel?: string | null;
};

