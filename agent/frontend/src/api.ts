// Agent 서버 API 호출 및 세션 오류 처리
import type {
  CertificatePage,
  CertificateWrite,
  CheckPage,
  Dashboard,
  DbPoolResponse,
  InstancePage,
  InstanceUpdate,
  InstanceWrite,
  ProjectPage,
  ProjectWrite,
  ResourceResponse,
  SessionUser,
  Threshold,
  CheckSettingsWrite,
  ServiceProfile,
} from './generated';
import { ApiError, DefaultService, OpenAPI, Status } from './generated';
import type { LogWrite } from './generated';
export type { LogSource, LogWrite } from './generated';

export function getLogs(projectId: string, instanceId: string) {
  return DefaultService.listLogs({ projectId, instanceId });
}
export function saveLog(projectId: string, instanceId: string, value: LogWrite, logId?: number) {
  return logId === undefined
    ? DefaultService.createLog({ projectId, instanceId, requestBody: value })
    : DefaultService.updateLog({ projectId, instanceId, logId, requestBody: value });
}
export function readLog(projectId: string, instanceId: string, logId: number, cursor?: string) {
  return DefaultService.readLog({ projectId, instanceId, logId, cursor });
}

import type { ChartPeriod } from './utils/chartPeriod';

export type ApiCheck = CheckPage['items'][number];

export const LOGIN_PATH = '/login';

// 세션이 거부되면 API 사용 전 재로그인 필요
export function isUnauthorized(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}

OpenAPI.WITH_CREDENTIALS = true;
OpenAPI.CREDENTIALS = 'same-origin';
OpenAPI.HEADERS = async () => {
  let csrf = csrfCookie();
  if (!csrf) {
    await fetch('/login', { cache: 'no-store', credentials: 'same-origin' });
    csrf = csrfCookie();
  }
  const headers: Record<string, string> = csrf
    ? { 'X-XSRF-TOKEN': maskCsrfToken(decodeURIComponent(csrf.substring('XSRF-TOKEN='.length))) }
    : {};
  return headers;
};

function csrfCookie() {
  return document.cookie.split('; ').find((cookie) => cookie.startsWith('XSRF-TOKEN='));
}

function maskCsrfToken(token: string) {
  const tokenBytes = new TextEncoder().encode(token);
  const randomBytes = crypto.getRandomValues(new Uint8Array(tokenBytes.length));
  const combined = new Uint8Array(tokenBytes.length * 2);
  combined.set(randomBytes);
  combined.set(
    tokenBytes.map((byte, index) => byte ^ randomBytes[index]),
    tokenBytes.length,
  );
  return btoa(String.fromCharCode(...combined))
    .replaceAll('+', '-')
    .replaceAll('/', '_');
}

export function getSession(): Promise<SessionUser> {
  return DefaultService.getSession();
}

export function logout(): Promise<void> {
  return DefaultService.logout();
}

export function getDashboard(period: ChartPeriod = '24h'): Promise<Dashboard> {
  return DefaultService.getDashboard({ period });
}

export function getProjects(): Promise<ProjectPage> {
  return DefaultService.listProjects({ page: 0, size: 200, sort: 'project_id,asc' });
}

export function getInstances(projectId: string): Promise<InstancePage> {
  return DefaultService.listInstances({ projectId, page: 0, size: 200 });
}

export function getResources(
  projectId: string,
  instanceId: string,
  period: ChartPeriod,
): Promise<ResourceResponse> {
  return DefaultService.getResources({ projectId, instanceId, period, maxPoints: 1000 });
}

export function getDbPools(
  projectId: string,
  instanceId: string,
  period: ChartPeriod,
): Promise<DbPoolResponse> {
  return DefaultService.getDbPools({ projectId, instanceId, period, maxPoints: 1000 });
}

export function getInternalChecks(
  projectId: string,
  instanceId: string,
  usage = '',
): Promise<CheckPage> {
  return DefaultService.listInternalChecks({
    projectId,
    instanceId,
    page: 0,
    size: 200,
    monitoringEnabled: usage === 'used' ? true : usage === 'unused' ? false : undefined,
  });
}

export function getApiChecks(filters: Record<string, string>): Promise<CheckPage> {
  return DefaultService.listApiChecks({
    page: 0,
    size: 200,
    sort: 'checked_at,desc',
    status: statusFilter(filters.status),
    project: filters.project || undefined,
    instance: filters.instance || undefined,
    direction: directionFilter(filters.direction),
    name: filters.name || undefined,
    monitoringEnabled:
      filters.usage === 'used' ? true : filters.usage === 'unused' ? false : undefined,
  });
}

export function runApiCheck(projectId: string, instanceId: string, checkId: string) {
  return DefaultService.runApiCheck({ projectId, instanceId, checkId });
}

export function saveApiCheckUsage(check: ApiCheck, enabled: boolean): Promise<void> {
  return DefaultService.updateApiCheckUsage({
    projectId: check.project_id,
    instanceId: check.instance_id,
    checkId: check.check_id,
    requestBody: { enabled },
  });
}

export function saveCheckSettings(check: ApiCheck, settings: CheckSettingsWrite): Promise<void> {
  return DefaultService.updateCheckSettings({
    projectId: check.project_id,
    instanceId: check.instance_id,
    checkId: check.check_id,
    requestBody: settings,
  });
}

export function saveServiceProfile(check: ApiCheck, profile: ServiceProfile | null): Promise<void> {
  return DefaultService.updateServiceProfile({
    projectId: check.project_id,
    instanceId: check.instance_id,
    checkId: check.check_id,
    requestBody: { profile },
  });
}

export function getCertificates(
  filters: Record<string, string> = {},
  page = 0,
): Promise<CertificatePage> {
  return DefaultService.listCertificates({
    page,
    size: 200,
    sort: 'hostname,asc',
    status: statusFilter(filters.status),
    project: filters.project || undefined,
  });
}

export function checkCertificate(id: number) {
  return DefaultService.checkCertificate({ id });
}

export function getThresholds(): Promise<Threshold[]> {
  return DefaultService.listThresholds();
}

export function saveThresholds(values: Threshold[]): Promise<Threshold[]> {
  return DefaultService.updateThresholds({ requestBody: values });
}

export function createProject(value: ProjectWrite) {
  return DefaultService.createProject({ requestBody: value }).then(() => undefined);
}

export function disableProject(projectId: string) {
  return DefaultService.disableProject({ projectId });
}

export function deleteProjectPermanently(projectId: string) {
  return DefaultService.deleteProjectPermanently({ projectId });
}

export function createInstance(projectId: string, value: InstanceWrite) {
  return DefaultService.createInstance({ projectId, requestBody: value }).then(() => undefined);
}

export function updateInstance(projectId: string, instanceId: string, value: InstanceUpdate) {
  return DefaultService.updateInstance({ projectId, instanceId, requestBody: value }).then(
    () => undefined,
  );
}

export function testInstance(projectId: string, instanceId: string) {
  return DefaultService.testInstance({ projectId, instanceId });
}

export function disableInstance(projectId: string, instanceId: string) {
  return DefaultService.disableInstance({ projectId, instanceId });
}

export function deleteInstancePermanently(projectId: string, instanceId: string) {
  return DefaultService.deleteInstancePermanently({ projectId, instanceId });
}

export function createCertificate(value: CertificateWrite) {
  return DefaultService.createCertificate({ requestBody: value }).then(() => undefined);
}

export function updateCertificate(id: number, value: CertificateWrite) {
  return DefaultService.updateCertificate({ id, requestBody: value }).then(() => undefined);
}

export function disableCertificate(id: number) {
  return DefaultService.disableCertificate({ id });
}

function statusFilter(value: string | undefined): Status | undefined {
  return Object.values(Status).includes(value as Status) ? (value as Status) : undefined;
}

function directionFilter(value: string | undefined): 'INTERNAL' | 'EXTERNAL' | undefined {
  return value === 'INTERNAL' || value === 'EXTERNAL' ? value : undefined;
}

export function getUsers(page = 0) {
  return DefaultService.listUsers({ page, size: 50 });
}
export function createUser(value: import('./generated').UserWrite) {
  return DefaultService.createUser({ requestBody: value });
}
export function updateUser(value: import('./generated').UserWrite) {
  return DefaultService.updateUser({ username: value.username, requestBody: value });
}
export function getAudit(page = 0, project = '', actor = '') {
  return DefaultService.listAudit({
    page,
    size: 50,
    project: project || undefined,
    actor: actor || undefined,
  });
}
