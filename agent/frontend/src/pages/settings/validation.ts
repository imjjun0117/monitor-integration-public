// 설정 입력값 검증 및 오류 문구 반환
import type {
  CertificateWrite,
  InstanceUpdate,
  InstanceWrite,
  ProjectWrite,
} from '../../generated';
import { Threshold } from '../../generated/models/Threshold';

export const MAX_POLL_INTERVAL_SECONDS = 715_827_882;

export const THRESHOLD_METRICS = [
  Threshold.metricKey.SYSTEM_CPU,
  Threshold.metricKey.PHYSICAL_MEMORY,
  Threshold.metricKey.JVM_HEAP,
  Threshold.metricKey.DISK,
  Threshold.metricKey.DB_POOL,
  Threshold.metricKey.API_LATENCY_MS,
  Threshold.metricKey.CERTIFICATE_DAYS,
];

export function emptyProject(): ProjectWrite {
  return { projectId: '', displayName: '', enabled: true };
}

export function emptyInstance(): InstanceWrite {
  return {
    instanceId: '',
    displayName: '',
    environment: 'local',
    agentBaseUrl: '',
    token: '',
    apiChecksEnabled: false,
    pollIntervalSeconds: 15,
    enabled: true,
  };
}

export function emptyCertificate(): CertificateWrite {
  return {
    projectId: '',
    hostname: '',
    port: 443,
    sniHostname: '',
    enabled: true,
    checkIntervalMinutes: 360,
  };
}

export function validateProject(value: ProjectWrite): string | undefined {
  if (!identifier(value.projectId)) {
    return '프로젝트 ID 형식이 올바르지 않습니다.';
  }
  if (
    !value.displayName.trim() ||
    value.displayName !== value.displayName.trim() ||
    codePointLength(value.displayName) > 120
  ) {
    return '프로젝트 표시명은 1자 이상 120자 이하여야 합니다.';
  }
  return undefined;
}

export function validateInstance(
  value: InstanceWrite | InstanceUpdate,
  tokenRequired: boolean,
): string | undefined {
  if (!identifier(value.instanceId)) {
    return '인스턴스 ID 형식이 올바르지 않습니다.';
  }
  if (
    !value.displayName.trim() ||
    value.displayName !== value.displayName.trim() ||
    codePointLength(value.displayName) > 120
  ) {
    return '인스턴스 표시명은 1자 이상 120자 이하여야 합니다.';
  }
  if (codePointLength(value.environment ?? '') > 40) {
    return '환경은 40자 이하여야 합니다.';
  }
  if (codePointLength(value.agentBaseUrl) > 500) {
    return 'Collector Base URL은 500자 이하여야 합니다.';
  }
  if (/(?:^|\/)\.{1,2}(?:\/|$)/.test(value.agentBaseUrl)) {
    return 'Collector Base URL에 . 또는 .. 경로 구간을 사용할 수 없습니다.';
  }
  try {
    const url = new URL(value.agentBaseUrl);
    if (
      !value.agentBaseUrl ||
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      value.agentBaseUrl !== value.agentBaseUrl.trim()
    ) {
      throw new Error('url');
    }
  } catch {
    return 'Collector Base URL은 http 또는 https URL이어야 합니다.';
  }
  const token = value.token ?? '';
  const hasToken = token.trim() !== '';
  if ((tokenRequired && !hasToken) || (hasToken && new TextEncoder().encode(token).length < 32)) {
    return 'Collector 토큰은 32 UTF-8 bytes 이상이어야 합니다.';
  }
  if (
    !Number.isInteger(value.pollIntervalSeconds) ||
    value.pollIntervalSeconds < 15 ||
    value.pollIntervalSeconds > MAX_POLL_INTERVAL_SECONDS
  ) {
    return `폴링 간격은 15초부터 ${MAX_POLL_INTERVAL_SECONDS}초 사이여야 합니다.`;
  }
  return undefined;
}

export function validateCertificate(value: CertificateWrite): string | undefined {
  if (!identifier(value.projectId) || !hostname(value.hostname) || !hostname(value.sniHostname)) {
    return '프로젝트, 호스트, SNI 호스트가 필요합니다.';
  }
  if (!Number.isInteger(value.port) || value.port < 1 || value.port > 65_535) {
    return '인증서 포트는 1부터 65535 사이여야 합니다.';
  }
  if (!Number.isInteger(value.checkIntervalMinutes) || value.checkIntervalMinutes < 1) {
    return '인증서 점검 간격은 1분 이상이어야 합니다.';
  }
  return undefined;
}

export function validateThresholds(values: Threshold[]): string | undefined {
  const badScope = values.some((value) =>
    value.scope === 'GLOBAL'
      ? value.projectId !== null || value.instanceId !== null
      : value.scope === 'PROJECT'
        ? !identifier(value.projectId ?? '') || value.instanceId !== null
        : !identifier(value.projectId ?? '') || !identifier(value.instanceId ?? ''),
  );
  if (badScope) {
    return '범위에 맞는 프로젝트와 인스턴스 ID가 필요합니다.';
  }
  const invalid = values.some(
    (value) =>
      !Number.isFinite(value.warningValue) ||
      !Number.isFinite(value.criticalValue) ||
      value.warningValue < 0 ||
      value.criticalValue < 0 ||
      (value.metricKey === 'CERTIFICATE_DAYS'
        ? value.warningValue < value.criticalValue
        : value.warningValue > value.criticalValue),
  );
  return invalid
    ? '임계치는 0 이상의 유한한 숫자이며 경고/위험 순서가 metric 의미와 맞아야 합니다.'
    : undefined;
}

export function changeThresholdScope(values: Threshold[], index: number, scope: Threshold.scope) {
  return values.map((item, itemIndex) =>
    itemIndex === index
      ? {
          ...item,
          scope,
          projectId: scope === 'GLOBAL' ? null : (item.projectId ?? ''),
          instanceId: scope === 'INSTANCE' ? (item.instanceId ?? '') : null,
        }
      : item,
  );
}

export function changeThresholdText(
  values: Threshold[],
  index: number,
  field: 'projectId' | 'instanceId',
  value: string,
) {
  return values.map((item, itemIndex) =>
    itemIndex === index ? { ...item, [field]: value } : item,
  );
}

export function changeThresholdMetric(
  values: Threshold[],
  index: number,
  value: Threshold.metricKey,
) {
  return values.map((item, itemIndex) =>
    itemIndex === index ? { ...item, metricKey: value } : item,
  );
}

export function changeThreshold(
  values: Threshold[],
  index: number,
  field: 'warningValue' | 'criticalValue',
  value: string,
) {
  return values.map((item, itemIndex) =>
    itemIndex === index ? { ...item, [field]: Number(value) } : item,
  );
}

export function identifier(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{1,63}$/.test(value);
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function hostname(value: string): boolean {
  if (!value || value !== value.trim() || /[\s/]/.test(value)) {
    return false;
  }
  try {
    const parsed = new URL(`https://${value}/`);
    const ascii = parsed.hostname;
    return (
      ascii.length <= 253 &&
      /^[a-z0-9.-]+$/i.test(ascii) &&
      ascii
        .split('.')
        .every(
          (label) =>
            label.length > 0 &&
            label.length <= 63 &&
            /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
        )
    );
  } catch {
    return false;
  }
}
