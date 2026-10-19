// 장애 목록과 상세 화면에서 공통 상태·대상·시각 표시
import type { Incident } from '../../generated';
import { formatDuration, formatPercent } from '../../utils/format';
import { checkFailure } from '../../utils/checkPresentation';

export const incidentStates: Record<Incident['state'], string> = {
  OPEN: '미확인',
  ACKNOWLEDGED: '확인 완료',
  IN_PROGRESS: '조치 중',
  RECOVERED: '복구',
  MONITORING_STOPPED: '감시 중지',
};
export const incidentKinds: Record<Incident['kind'], string> = {
  COLLECTION: '서버 수집',
  METRIC: '자원',
  CHECK: 'API · 내부 점검',
  CERTIFICATE: '인증서',
};
const metrics: Record<string, string> = {
  SYSTEM_CPU: '시스템 CPU',
  PHYSICAL_MEMORY: '물리 메모리',
  JVM_HEAP: 'JVM Heap',
  DISK: '디스크',
  DB_POOL: 'DB 풀',
  API_LATENCY_MS: 'API 응답시간',
  CERTIFICATE_DAYS: '인증서 만료',
};
export function incidentTitle(incident: Incident) {
  const name = metrics[incident.metric_key ?? ''] ?? incidentKinds[incident.kind];
  return incident.subject_name ? `${name} · ${incident.subject_name}` : name;
}
export function incidentDuration(incident: Incident) {
  return formatDuration(
    new Date(incident.closed_at ?? Date.now()).getTime() - new Date(incident.opened_at).getTime(),
  );
}
export function incidentTime(value?: string | null) {
  return value
    ? new Date(value).toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
    : '—';
}
export function observationValue(metric: string | null, value: number | null) {
  if (value == null) {
    return '미확인';
  }
  if (metric === 'CERTIFICATE_DAYS') {
    return `${value}일`;
  }
  if (metric === 'API_LATENCY_MS') {
    return `${value}ms`;
  }
  return formatPercent(value);
}

// 판정 코드와 측정값을 목록·상세에서 읽을 수 있는 설명으로 표시
export function observationSummary(observation: Incident['latest_observation']) {
  if (!observation.status || observation.status === 'UNKNOWN') {
    return '최근 상태를 확인하지 못했습니다.';
  }
  if (observation.metric_key && observation.value != null) {
    const threshold =
      observation.status === 'DOWN' ? observation.critical_value : observation.warning_value;
    const level = observation.status === 'DOWN' ? '위험' : '경고';
    return (
      `최근 측정 ${observationValue(observation.metric_key, observation.value)}` +
      (observation.status === 'UP'
        ? ' · 정상 범위'
        : threshold == null
          ? ''
          : ` · ${level} 기준 ${observationValue(observation.metric_key, threshold)}`)
    );
  }
  if (observation.kind === 'COLLECTION') {
    return observation.status === 'UP'
      ? '서버 데이터를 정상적으로 수집하고 있습니다.'
      : observation.status === 'WARN'
        ? '서버 데이터 수집이 지연되고 있습니다.'
        : '서버 데이터 수집이 중단됐습니다. 연결 상태를 확인하세요.';
  }
  if (observation.status === 'UP') {
    return '최근 점검에서 정상 상태를 확인했습니다.';
  }
  return checkFailure(observation.result_code, observation.subject_id ?? '');
}
