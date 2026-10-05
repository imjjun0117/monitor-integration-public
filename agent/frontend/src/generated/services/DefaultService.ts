/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ActionStatus } from '../models/ActionStatus';
import type { AuditPage } from '../models/AuditPage';
import type { CertificatePage } from '../models/CertificatePage';
import type { CertificateWrite } from '../models/CertificateWrite';
import type { CheckPage } from '../models/CheckPage';
import type { CheckSettingsWrite } from '../models/CheckSettingsWrite';
import type { Dashboard } from '../models/Dashboard';
import type { DbPoolResponse } from '../models/DbPoolResponse';
import type { Identifier } from '../models/Identifier';
import type { InstancePage } from '../models/InstancePage';
import type { InstanceUpdate } from '../models/InstanceUpdate';
import type { InstanceWrite } from '../models/InstanceWrite';
import type { LoginRequest } from '../models/LoginRequest';
import type { LogRead } from '../models/LogRead';
import type { LogSource } from '../models/LogSource';
import type { LogWrite } from '../models/LogWrite';
import type { ProjectPage } from '../models/ProjectPage';
import type { ProjectWrite } from '../models/ProjectWrite';
import type { ResourceResponse } from '../models/ResourceResponse';
import type { ServiceProfileWrite } from '../models/ServiceProfileWrite';
import type { SessionUser } from '../models/SessionUser';
import type { Status } from '../models/Status';
import type { Threshold } from '../models/Threshold';
import type { UserPage } from '../models/UserPage';
import type { UserWrite } from '../models/UserWrite';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class DefaultService {
    /**
     * @returns LogSource Configured log files (administrator or assigned operator only)
     * @throws ApiError
     */
    public static listLogs({
        projectId,
        instanceId,
    }: {
        projectId: Identifier,
        instanceId: Identifier,
    }): CancelablePromise<Array<LogSource>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/projects/{projectId}/instances/{instanceId}/logs',
            path: {
                'projectId': projectId,
                'instanceId': instanceId,
            },
            errors: {
                401: `Authentication failed`,
                403: `CSRF token missing or access denied`,
            },
        });
    }
    /**
     * @returns any Created
     * @throws ApiError
     */
    public static createLog({
        projectId,
        instanceId,
        requestBody,
    }: {
        projectId: Identifier,
        instanceId: Identifier,
        requestBody: LogWrite,
    }): CancelablePromise<{
        log_id: number;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/projects/{projectId}/instances/{instanceId}/logs',
            path: {
                'projectId': projectId,
                'instanceId': instanceId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request`,
                401: `Authentication failed`,
                403: `CSRF token missing or access denied`,
            },
        });
    }
    /**
     * @returns any Updated
     * @throws ApiError
     */
    public static updateLog({
        projectId,
        instanceId,
        logId,
        requestBody,
    }: {
        projectId: Identifier,
        instanceId: Identifier,
        logId: number,
        requestBody: LogWrite,
    }): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/projects/{projectId}/instances/{instanceId}/logs/{logId}',
            path: {
                'projectId': projectId,
                'instanceId': instanceId,
                'logId': logId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request`,
                401: `Authentication failed`,
                403: `CSRF token missing or access denied`,
            },
        });
    }
    /**
     * @returns LogRead Bounded raw text; on-demand shared polling, never persisted
     * @throws ApiError
     */
    public static readLog({
        projectId,
        instanceId,
        logId,
        cursor,
    }: {
        projectId: Identifier,
        instanceId: Identifier,
        logId: number,
        cursor?: string,
    }): CancelablePromise<LogRead> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/projects/{projectId}/instances/{instanceId}/logs/{logId}/read',
            path: {
                'projectId': projectId,
                'instanceId': instanceId,
                'logId': logId,
            },
            query: {
                'cursor': cursor,
            },
            errors: {
                401: `Authentication failed`,
                403: `CSRF token missing or access denied`,
            },
        });
    }
    /**
     * @returns void
     * @throws ApiError
     */
    public static login({
        formData,
    }: {
        formData: LoginRequest,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/session/login',
            formData: formData,
            mediaType: 'application/x-www-form-urlencoded',
            errors: {
                302: `Login succeeded and redirects to the SPA root`,
                401: `Authentication failed`,
                403: `CSRF token missing or access denied`,
            },
        });
    }
    /**
     * @returns void
     * @throws ApiError
     */
    public static logout(): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/session/logout',
        });
    }
    /**
     * @returns SessionUser Current session
     * @throws ApiError
     */
    public static getSession(): CancelablePromise<SessionUser> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/session/me',
            errors: {
                401: `Authentication failed`,
            },
        });
    }
    /**
     * @returns UserPage Administrator user list without credentials
     * @throws ApiError
     */
    public static listUsers({
        page,
        size = 50,
    }: {
        page?: number,
        size?: number,
    }): CancelablePromise<UserPage> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/settings/users',
            query: {
                'page': page,
                'size': size,
            },
            errors: {
                401: `Authentication failed`,
                403: `CSRF token missing or access denied`,
            },
        });
    }
    /**
     * @returns any User created
     * @throws ApiError
     */
    public static createUser({
        requestBody,
    }: {
        requestBody: UserWrite,
    }): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/settings/users',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request`,
                401: `Authentication failed`,
                403: `CSRF token missing or access denied`,
                409: `Resource conflict`,
            },
        });
    }
    /**
     * @returns void
     * @throws ApiError
     */
    public static updateUser({
        username,
        requestBody,
    }: {
        username: string,
        requestBody: UserWrite,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/settings/users/{username}',
            path: {
                'username': username,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request`,
                401: `Authentication failed`,
                403: `CSRF token missing or access denied`,
                404: `Resource not found`,
                409: `Resource conflict`,
            },
        });
    }
    /**
     * @returns AuditPage Configuration changes and request outcomes, without secrets
     * @throws ApiError
     */
    public static listAudit({
        page,
        size = 50,
        project,
        actor,
    }: {
        page?: number,
        size?: number,
        project?: string,
        actor?: string,
    }): CancelablePromise<AuditPage> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/settings/audit',
            query: {
                'page': page,
                'size': size,
                'project': project,
                'actor': actor,
            },
            errors: {
                401: `Authentication failed`,
                403: `CSRF token missing or access denied`,
            },
        });
    }
    /**
     * @returns Dashboard Dashboard summary
     * @throws ApiError
     */
    public static getDashboard({
        period = '24h',
    }: {
        period?: '24h' | '7d' | '30d' | '365d',
    }): CancelablePromise<Dashboard> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/dashboard',
            query: {
                'period': period,
            },
            errors: {
                401: `Authentication failed`,
            },
        });
    }
    /**
     * @returns ProjectPage Project page
     * @throws ApiError
     */
    public static listProjects({
        page,
        size = 50,
        sort,
        status,
    }: {
        page?: number,
        size?: number,
        /**
         * Allowlisted field and direction, for example project_id,asc
         */
        sort?: string,
        status?: Status,
    }): CancelablePromise<ProjectPage> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/projects',
            query: {
                'page': page,
                'size': size,
                'sort': sort,
                'status': status,
            },
            errors: {
                400: `Invalid request`,
                401: `Authentication failed`,
            },
        });
    }
    /**
     * @returns any Project created
     * @throws ApiError
     */
    public static createProject({
        requestBody,
    }: {
        requestBody: ProjectWrite,
    }): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/projects',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request`,
                401: `Authentication failed`,
                403: `CSRF token missing or access denied`,
                409: `Resource conflict`,
            },
        });
    }
    /**
     * @returns any Project updated
     * @throws ApiError
     */
    public static updateProject({
        projectId,
        requestBody,
    }: {
        projectId: Identifier,
        requestBody: ProjectWrite,
    }): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/projects/{projectId}',
            path: {
                'projectId': projectId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request`,
                401: `Authentication failed`,
                403: `CSRF token missing or access denied`,
            },
        });
    }
    /**
     * @returns void
     * @throws ApiError
     */
    public static disableProject({
        projectId,
    }: {
        projectId: Identifier,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/projects/{projectId}',
            path: {
                'projectId': projectId,
            },
            errors: {
                401: `Authentication failed`,
                403: `CSRF token missing or access denied`,
            },
        });
    }
    /**
     * @returns void
     * @throws ApiError
     */
    public static deleteProjectPermanently({
        projectId,
    }: {
        projectId: Identifier,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/projects/{projectId}/permanent',
            path: {
                'projectId': projectId,
            },
            errors: {
                400: `Invalid request`,
                401: `Authentication failed`,
                403: `CSRF token missing or access denied`,
                404: `Resource not found`,
                409: `Resource conflict`,
            },
        });
    }
    /**
     * @returns InstancePage Instance page
     * @throws ApiError
     */
    public static listInstances({
        projectId,
        page,
        size = 50,
        sort,
        status,
    }: {
        projectId: Identifier,
        page?: number,
        size?: number,
        /**
         * Allowlisted field and direction, for example project_id,asc
         */
        sort?: string,
        status?: Status,
    }): CancelablePromise<InstancePage> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/projects/{projectId}/instances',
            path: {
                'projectId': projectId,
            },
            query: {
                'page': page,
                'size': size,
                'sort': sort,
                'status': status,
            },
            errors: {
                400: `Invalid request`,
                401: `Authentication failed`,
            },
        });
    }
    /**
     * @returns any Instance created
     * @throws ApiError
     */
    public static createInstance({
        projectId,
        requestBody,
    }: {
        projectId: Identifier,
        requestBody: InstanceWrite,
    }): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/projects/{projectId}/instances',
            path: {
                'projectId': projectId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request`,
                401: `Authentication failed`,
                403: `CSRF token missing or access denied`,
                404: `Resource not found`,
                409: `Resource conflict`,
            },
        });
    }
    /**
     * @returns any Instance updated
     * @throws ApiError
     */
    public static updateInstance({
        projectId,
        instanceId,
        requestBody,
    }: {
        projectId: Identifier,
        instanceId: Identifier,
        requestBody: InstanceUpdate,
    }): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/projects/{projectId}/instances/{instanceId}',
            path: {
                'projectId': projectId,
                'instanceId': instanceId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request`,
                401: `Authentication failed`,
                403: `CSRF token missing or access denied`,
                409: `Resource conflict`,
            },
        });
    }
    /**
     * @returns void
     * @throws ApiError
     */
    public static disableInstance({
        projectId,
        instanceId,
    }: {
        projectId: Identifier,
        instanceId: Identifier,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/projects/{projectId}/instances/{instanceId}',
            path: {
                'projectId': projectId,
                'instanceId': instanceId,
            },
            errors: {
                401: `Authentication failed`,
                403: `CSRF token missing or access denied`,
            },
        });
    }
    /**
     * @returns void
     * @throws ApiError
     */
    public static deleteInstancePermanently({
        projectId,
        instanceId,
    }: {
        projectId: Identifier,
        instanceId: Identifier,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/projects/{projectId}/instances/{instanceId}/permanent',
            path: {
                'projectId': projectId,
                'instanceId': instanceId,
            },
            errors: {
                400: `Invalid request`,
                401: `Authentication failed`,
                403: `CSRF token missing or access denied`,
                404: `Resource not found`,
                409: `Resource conflict`,
            },
        });
    }
    /**
     * @returns ActionStatus Connection result
     * @throws ApiError
     */
    public static testInstance({
        projectId,
        instanceId,
    }: {
        projectId: Identifier,
        instanceId: Identifier,
    }): CancelablePromise<ActionStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/projects/{projectId}/instances/{instanceId}/test',
            path: {
                'projectId': projectId,
                'instanceId': instanceId,
            },
            errors: {
                401: `Authentication failed`,
                403: `CSRF token missing or access denied`,
                404: `Resource not found`,
            },
        });
    }
    /**
     * @returns ResourceResponse Resource latest and history
     * @throws ApiError
     */
    public static getResources({
        projectId,
        instanceId,
        period = '24h',
        maxPoints = 1000,
    }: {
        projectId: Identifier,
        instanceId: Identifier,
        period?: '24h' | '7d' | '30d' | '365d',
        maxPoints?: number,
    }): CancelablePromise<ResourceResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/projects/{projectId}/instances/{instanceId}/resources',
            path: {
                'projectId': projectId,
                'instanceId': instanceId,
            },
            query: {
                'period': period,
                'max_points': maxPoints,
            },
            errors: {
                400: `Invalid request`,
                401: `Authentication failed`,
            },
        });
    }
    /**
     * @returns DbPoolResponse Pool latest and history
     * @throws ApiError
     */
    public static getDbPools({
        projectId,
        instanceId,
        period = '24h',
        maxPoints = 1000,
    }: {
        projectId: Identifier,
        instanceId: Identifier,
        period?: '24h' | '7d' | '30d' | '365d',
        maxPoints?: number,
    }): CancelablePromise<DbPoolResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/projects/{projectId}/instances/{instanceId}/db-pools',
            path: {
                'projectId': projectId,
                'instanceId': instanceId,
            },
            query: {
                'period': period,
                'max_points': maxPoints,
            },
            errors: {
                400: `Invalid request`,
                401: `Authentication failed`,
            },
        });
    }
    /**
     * @returns CheckPage Internal check page
     * @throws ApiError
     */
    public static listInternalChecks({
        projectId,
        instanceId,
        monitoringEnabled,
        page,
        size = 50,
        sort,
        status,
    }: {
        projectId: Identifier,
        instanceId: Identifier,
        /**
         * Filter used or unused checks.
         */
        monitoringEnabled?: boolean,
        page?: number,
        size?: number,
        /**
         * Allowlisted field and direction, for example project_id,asc
         */
        sort?: string,
        status?: Status,
    }): CancelablePromise<CheckPage> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/projects/{projectId}/instances/{instanceId}/internal-checks',
            path: {
                'projectId': projectId,
                'instanceId': instanceId,
            },
            query: {
                'monitoringEnabled': monitoringEnabled,
                'page': page,
                'size': size,
                'sort': sort,
                'status': status,
            },
            errors: {
                400: `Invalid request`,
                401: `Authentication failed`,
            },
        });
    }
    /**
     * @returns CheckPage API check page
     * @throws ApiError
     */
    public static listApiChecks({
        page,
        size = 50,
        sort,
        status,
        project,
        instance,
        direction,
        name,
        monitoringEnabled,
    }: {
        page?: number,
        size?: number,
        /**
         * Allowlisted field and direction, for example project_id,asc
         */
        sort?: string,
        status?: Status,
        project?: Identifier,
        instance?: Identifier,
        direction?: 'INTERNAL' | 'EXTERNAL',
        name?: string,
        /**
         * Filter used or unused API checks. Omit to include both.
         */
        monitoringEnabled?: boolean,
    }): CancelablePromise<CheckPage> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api-checks',
            query: {
                'page': page,
                'size': size,
                'sort': sort,
                'status': status,
                'project': project,
                'instance': instance,
                'direction': direction,
                'name': name,
                'monitoringEnabled': monitoringEnabled,
            },
            errors: {
                400: `Invalid request`,
                401: `Authentication failed`,
            },
        });
    }
    /**
     * @returns void
     * @throws ApiError
     */
    public static updateServiceProfile({
        projectId,
        instanceId,
        checkId,
        requestBody,
    }: {
        projectId: Identifier,
        instanceId: Identifier,
        checkId: Identifier,
        requestBody: ServiceProfileWrite,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api-checks/{projectId}/{instanceId}/{checkId}/service',
            path: {
                'projectId': projectId,
                'instanceId': instanceId,
                'checkId': checkId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request`,
                401: `Authentication failed`,
                403: `CSRF token missing or access denied`,
            },
        });
    }
    /**
     * @returns void
     * @throws ApiError
     */
    public static updateCheckSettings({
        projectId,
        instanceId,
        checkId,
        requestBody,
    }: {
        projectId: Identifier,
        instanceId: Identifier,
        checkId: Identifier,
        requestBody: CheckSettingsWrite,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api-checks/{projectId}/{instanceId}/{checkId}/settings',
            path: {
                'projectId': projectId,
                'instanceId': instanceId,
                'checkId': checkId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request`,
                401: `Authentication failed`,
                403: `CSRF token missing or access denied`,
            },
        });
    }
    /**
     * @returns void
     * @throws ApiError
     */
    public static updateApiCheckUsage({
        projectId,
        instanceId,
        checkId,
        requestBody,
    }: {
        projectId: Identifier,
        instanceId: Identifier,
        checkId: Identifier,
        requestBody: {
            enabled: boolean;
        },
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api-checks/{projectId}/{instanceId}/{checkId}/usage',
            path: {
                'projectId': projectId,
                'instanceId': instanceId,
                'checkId': checkId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request`,
                401: `Authentication failed`,
                403: `CSRF token missing or access denied`,
            },
        });
    }
    /**
     * @returns ActionStatus Check accepted
     * @throws ApiError
     */
    public static runApiCheck({
        projectId,
        instanceId,
        checkId,
    }: {
        projectId: Identifier,
        instanceId: Identifier,
        checkId: Identifier,
    }): CancelablePromise<ActionStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api-checks/{projectId}/{instanceId}/{checkId}/run',
            path: {
                'projectId': projectId,
                'instanceId': instanceId,
                'checkId': checkId,
            },
            errors: {
                400: `Invalid request`,
                401: `Authentication failed`,
                403: `CSRF token missing or access denied`,
                429: `Check already running or rate limited`,
            },
        });
    }
    /**
     * @returns CertificatePage Certificate page
     * @throws ApiError
     */
    public static listCertificates({
        page,
        size = 50,
        sort,
        status,
        project,
    }: {
        page?: number,
        size?: number,
        /**
         * Allowlisted field and direction, for example project_id,asc
         */
        sort?: string,
        status?: Status,
        project?: Identifier,
    }): CancelablePromise<CertificatePage> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/certificates',
            query: {
                'page': page,
                'size': size,
                'sort': sort,
                'status': status,
                'project': project,
            },
            errors: {
                400: `Invalid request`,
                401: `Authentication failed`,
            },
        });
    }
    /**
     * @returns any Certificate target created
     * @throws ApiError
     */
    public static createCertificate({
        requestBody,
    }: {
        requestBody: CertificateWrite,
    }): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/certificates',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request`,
                401: `Authentication failed`,
                403: `CSRF token missing or access denied`,
            },
        });
    }
    /**
     * @returns any Certificate target updated
     * @throws ApiError
     */
    public static updateCertificate({
        id,
        requestBody,
    }: {
        id: number,
        requestBody: CertificateWrite,
    }): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/certificates/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request`,
                401: `Authentication failed`,
                403: `CSRF token missing or access denied`,
            },
        });
    }
    /**
     * @returns void
     * @throws ApiError
     */
    public static disableCertificate({
        id,
    }: {
        id: number,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/certificates/{id}',
            path: {
                'id': id,
            },
            errors: {
                401: `Authentication failed`,
                403: `CSRF token missing or access denied`,
            },
        });
    }
    /**
     * @returns ActionStatus Certificate check accepted
     * @throws ApiError
     */
    public static checkCertificate({
        id,
    }: {
        id: number,
    }): CancelablePromise<ActionStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/certificates/{id}/check',
            path: {
                'id': id,
            },
            errors: {
                400: `Invalid request`,
                401: `Authentication failed`,
                403: `CSRF token missing or access denied`,
                404: `Resource not found`,
                429: `Check already running or rate limited`,
            },
        });
    }
    /**
     * @returns Threshold Thresholds
     * @throws ApiError
     */
    public static listThresholds(): CancelablePromise<Array<Threshold>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/settings/thresholds',
            errors: {
                401: `Authentication failed`,
            },
        });
    }
    /**
     * @returns Threshold Updated thresholds
     * @throws ApiError
     */
    public static updateThresholds({
        requestBody,
    }: {
        requestBody: Array<Threshold>,
    }): CancelablePromise<Array<Threshold>> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/settings/thresholds',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request`,
                401: `Authentication failed`,
                403: `CSRF token missing or access denied`,
            },
        });
    }
}
