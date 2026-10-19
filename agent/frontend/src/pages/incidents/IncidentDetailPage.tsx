// 장애 처리와 같은 시간대의 자원·점검·보관 로그·설정 변경 이력 조사
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { actOnIncident, getIncident, getIncidentEvidence } from '../../api';
import { ApiError, IncidentAction } from '../../generated';
import type { Incident, IncidentDetail, IncidentEvidence } from '../../generated';
import { usePermissions } from '../../components/PermissionContext';
import MetricChart from '../../components/MetricChart';
import StatusLabel from '../../components/StatusLabel';
import { Empty, Failure, Loading, RefreshFailure } from '../../components/QueryState';
import {
  Alert,
  Button,
  FormSelect,
  FormSelectOption,
  Label,
  Tab,
  Tabs,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '../../components/ui';
import { LabeledField } from '../settings/forms';
import { checkFailure } from '../../utils/checkPresentation';
import {
  incidentDuration,
  incidentStates,
  incidentTime,
  incidentTitle,
  observationValue,
  observationSummary,
} from './presentation';
import './incidents.css';

export default function IncidentDetailPage() {
  const id = Number(useParams().incidentId);
  const [at, setAt] = useState<string>();
  const query = useQuery({
    queryKey: ['incident', id],
    queryFn: () => getIncident(id),
    enabled: Number.isSafeInteger(id) && id > 0,
    refetchInterval: 15_000,
  });
  const evidence = useQuery({
    queryKey: ['incident-evidence', id, at],
    queryFn: () => getIncidentEvidence(id, at),
    enabled: Boolean(query.data),
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === id ? previous : undefined,
  });
  if (!Number.isSafeInteger(id) || id <= 0) {
    return <Failure message="올바른 장애 번호가 아닙니다." />;
  }
  if (!query.data) {
    return query.isPending ? (
      <Loading />
    ) : (
      <Failure message="장애가 없거나 조회할 권한이 없습니다." />
    );
  }
  const incident = query.data.incident;
  return (
    <div className="incident-page">
      <Link to={`/incidents?${new URLSearchParams({ project: incident.project_id })}`}>
        ← 장애 관리대장
      </Link>
      <section className="incident-section incident-overview" aria-label="장애 요약">
        <div className="incident-heading">
          <div>
            <span className="incident-meta">장애 #{id}</span>
            <h2>{incidentTitle(incident)}</h2>
            <p>
              {incident.project_name} · {incident.instance_name ?? '프로젝트 공통'}
            </p>
          </div>
          <Label className={`incident-state incident-state-${incident.state}`}>
            {incidentStates[incident.state]}
          </Label>
        </div>
        <div className="incident-cause">
          <StatusLabel
            status={incident.latest_observation.status}
            context={
              incident.kind === 'COLLECTION'
                ? 'collection'
                : incident.kind === 'METRIC'
                  ? undefined
                  : 'check'
            }
          />
          <strong>{observationSummary(incident.latest_observation)}</strong>
        </div>
        <RefreshFailure
          visible={query.isError}
          updatedAt={query.dataUpdatedAt}
          retry={() => void query.refetch()}
        />
        <dl className="incident-facts">
          <div>
            <dt>최초 감지</dt>
            <dd>{incidentTime(incident.opened_at)}</dd>
          </div>
          <div>
            <dt>최근 이상 확인</dt>
            <dd>{incidentTime(incident.last_detected_at)}</dd>
          </div>
          <div>
            <dt>{incident.state === 'MONITORING_STOPPED' ? '감시 중지 시각' : '복구 시각'}</dt>
            <dd>{incidentTime(incident.closed_at)}</dd>
          </div>
          <div>
            <dt>감지 후 지속 시간</dt>
            <dd>{incidentDuration(incident)}</dd>
          </div>
          <div>
            <dt>담당자</dt>
            <dd>{incident.assignee ?? '미지정'}</dd>
          </div>
          <div>
            <dt>최고 위험도</dt>
            <dd>{incident.severity === 'DOWN' ? '위험' : '경고'}</dd>
          </div>
        </dl>
        {incident.state === 'MONITORING_STOPPED' && (
          <Alert title="감시 중지로 종료된 기록입니다." variant="warning">
            정상 복구가 확인된 기록과 구분합니다.
          </Alert>
        )}
        <details className="incident-comparison">
          <summary>최초·최근 감지값 비교</summary>
          <div className="incident-observations">
            <Observation title="최초 판정" observation={incident.first_observation} />
            <Observation title="최근 판정" observation={incident.latest_observation} />
          </div>
          <p className="field-help">
            최초 감지는 이 기능이 이상을 처음 확인한 시각입니다. 실제 장애 시작 시각과 다를 수
            있습니다.
          </p>
        </details>
      </section>
      <div className="incident-workspace">
        <section className="incident-section incident-investigation" aria-label="장애 조사">
          <h3>원인 조사</h3>
          <p className="field-help">확인할 시점을 선택하고, 당시의 자원·점검·로그를 살펴보세요.</p>
          <div
            className="incident-toolbar incident-periods"
            role="group"
            aria-label="조사 기준 시점"
          >
            <Button
              variant="secondary"
              aria-pressed={at === undefined || at === incident.opened_at}
              onClick={() => setAt(incident.opened_at)}
            >
              발생 전후
            </Button>
            <Button
              variant="secondary"
              aria-pressed={at === incident.last_detected_at}
              onClick={() => setAt(incident.last_detected_at)}
            >
              최근 이상 전후
            </Button>
            {incident.closed_at && (
              <Button
                variant="secondary"
                aria-pressed={at === incident.closed_at}
                onClick={() => setAt(incident.closed_at!)}
              >
                {incident.state === 'RECOVERED' ? '복구 전후' : '감시 중지 전후'}
              </Button>
            )}
            <Button variant="link" onClick={() => void evidence.refetch()}>
              조사 자료 새로고침
            </Button>
          </div>
          <RefreshFailure
            visible={evidence.isError && Boolean(evidence.data)}
            updatedAt={evidence.dataUpdatedAt}
            retry={() => void evidence.refetch()}
          />
          {evidence.isFetching && evidence.data && (
            <p role="status">선택한 시점의 자료를 불러오는 중입니다.</p>
          )}
          {evidence.isPending ? (
            <Loading />
          ) : !evidence.data ? (
            <Failure message="조사 자료를 불러오지 못했습니다." />
          ) : (
            <Evidence key={id} data={evidence.data} incident={incident} />
          )}
        </section>
        <aside className="incident-side" aria-label="담당자와 조치 기록">
          <IncidentActions key={id} detail={query.data} />
          <section className="incident-section" aria-label="조치 이력">
            <details className="incident-history" open={query.data.events.length <= 3}>
              <summary>
                조치 이력 <span>{query.data.events.length}건</span>
              </summary>
              <p className="field-help">최근 100건 · 최신순</p>
              {!query.data.events.length ? (
                <p>아직 기록된 조치가 없습니다.</p>
              ) : (
                <ol className="incident-timeline">
                  {query.data.events.map((event) => (
                    <li key={event.event_id}>
                      <div>
                        <strong>{eventLabels[event.event_type] ?? event.event_type}</strong>
                        <span>
                          {incidentTime(event.occurred_at)} ·{' '}
                          {event.actor === 'SYSTEM' ? '자동 판정' : event.actor}
                        </span>
                      </div>
                      {event.event_type === 'ASSIGNED' && (
                        <p>담당자: {event.assignee ?? '미지정'}</p>
                      )}
                      {event.note && <p className="incident-note">{event.note}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </details>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Observation({
  title,
  observation,
}: {
  title: string;
  observation: Incident['first_observation'];
}) {
  return (
    <div>
      <h4>{title}</h4>
      <StatusLabel
        status={observation.status}
        context={
          observation.kind === 'COLLECTION'
            ? 'collection'
            : observation.kind === 'METRIC'
              ? undefined
              : 'check'
        }
      />
      <p>원본 관측 시각: {incidentTime(observation.observed_at)}</p>
      {observation.metric_key && (
        <p>
          측정값: {observationValue(observation.metric_key, observation.value)} · 경고{' '}
          {observationValue(observation.metric_key, observation.warning_value)} / 위험{' '}
          {observationValue(observation.metric_key, observation.critical_value)}
        </p>
      )}
      {observation.result_code && (
        <p>
          결과 코드: <code>{observation.result_code}</code>
        </p>
      )}
      {observation.kind === 'CHECK' && observation.result_code && (
        <p>{checkFailure(observation.result_code, observation.subject_id ?? '')}</p>
      )}
      {observation.kind === 'COLLECTION' &&
        !observation.result_code &&
        observation.status !== 'UP' && <p>수집 시각과 연결 상태를 확인하세요.</p>}
    </div>
  );
}

function IncidentActions({ detail }: { detail: IncidentDetail }) {
  const { canWrite } = usePermissions();
  const client = useQueryClient();
  const [version, setVersion] = useState(detail.incident.version);
  const [assignee, setAssignee] = useState(detail.incident.assignee ?? '');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  const mutation = useMutation({
    mutationFn: (action: IncidentAction) => actOnIncident(detail.incident.incident_id, action),
    onSuccess: (incident, action) => {
      setVersion(incident.version);
      client.setQueryData<IncidentDetail>(['incident', incident.incident_id], (previous) =>
        previous ? { ...previous, incident } : previous,
      );
      if (action.action === IncidentAction.action.COMMENT) {
        setNote('');
      }
      setSaved(true);
      void client.invalidateQueries({ queryKey: ['incident', incident.incident_id] });
      void client.invalidateQueries({ queryKey: ['incidents'] });
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: ['incident', detail.incident.incident_id] });
    },
  });
  if (!canWrite) {
    return null;
  }
  const changed = version !== detail.incident.version && !mutation.isPending;
  const submit = (action: IncidentAction.action) => {
    setSaved(false);
    mutation.mutate({
      version,
      action,
      ...(action === IncidentAction.action.ASSIGN ? { assignee: assignee || null } : {}),
      ...(action === IncidentAction.action.COMMENT ? { note } : {}),
    });
  };
  return (
    <>
      <p className="mobile-readonly-notice">
        담당자·조치 기록 변경은 데스크톱 화면에서 가능합니다.
      </p>
      <section className="incident-section incident-actions" aria-label="장애 처리">
        <h3>장애 처리</h3>
        <p className="field-help">정상 상태가 확인되면 자동으로 복구 처리됩니다.</p>
        <div className="incident-toolbar">
          <Button
            variant="secondary"
            isDisabled={detail.incident.state !== 'OPEN' || mutation.isPending}
            onClick={() => submit(IncidentAction.action.ACKNOWLEDGE)}
          >
            확인 처리
          </Button>
          <Button
            isDisabled={
              !['OPEN', 'ACKNOWLEDGED'].includes(detail.incident.state) || mutation.isPending
            }
            onClick={() => submit(IncidentAction.action.START)}
          >
            조치 시작
          </Button>
        </div>
        <div className="incident-toolbar">
          <LabeledField id="incident-assignee" label="담당자">
            <FormSelect
              id="incident-assignee"
              value={assignee}
              isDisabled={mutation.isPending}
              onChange={(_, value) => setAssignee(value)}
            >
              <FormSelectOption value="" label="미지정" />
              {assignee && !detail.assignees.includes(assignee) && (
                <FormSelectOption
                  value={assignee}
                  label={`${assignee} (현재 배정 불가)`}
                  isDisabled
                />
              )}
              {detail.assignees.map((username) => (
                <FormSelectOption key={username} value={username} label={username} />
              ))}
            </FormSelect>
          </LabeledField>
          <Button
            variant="secondary"
            isDisabled={mutation.isPending}
            onClick={() => submit(IncidentAction.action.ASSIGN)}
          >
            담당자 저장
          </Button>
        </div>
        <LabeledField
          id="incident-note"
          label="조치 메모"
          help="최대 2,000자. 비밀번호·토큰·개인정보는 입력하지 마세요."
        >
          <textarea
            id="incident-note"
            value={note}
            maxLength={2000}
            rows={3}
            disabled={mutation.isPending}
            onChange={(event) => setNote(event.target.value)}
          />
        </LabeledField>
        <Button
          isDisabled={!note.trim() || mutation.isPending}
          onClick={() => submit(IncidentAction.action.COMMENT)}
        >
          메모 등록
        </Button>
        {saved && <p role="status">조치 기록을 저장했습니다.</p>}
        {(changed || (mutation.error instanceof ApiError && mutation.error.status === 409)) && (
          <Alert
            variant="warning"
            title="장애 상태나 다른 담당자의 기록이 변경되었습니다."
            actionLinks={
              <Button
                variant="link"
                onClick={() => {
                  setVersion(detail.incident.version);
                  setSaved(false);
                  mutation.reset();
                }}
              >
                최신 상태로 계속 작성
              </Button>
            }
          >
            입력한 메모는 유지됩니다. 현재 상태와 담당자를 확인한 뒤 저장하세요.
          </Alert>
        )}
        {mutation.isError &&
          !(mutation.error instanceof ApiError && mutation.error.status === 409) && (
            <Alert variant="danger" title="조치 기록을 저장하지 못했습니다." />
          )}
      </section>
    </>
  );
}

function Evidence({ data, incident }: { data: IncidentEvidence; incident: Incident }) {
  const [tab, setTab] = useState<string | number>(
    incident.kind === 'CHECK' || !incident.instance_id ? 'checks' : 'resources',
  );
  const [metric, setMetric] = useState(
    resourceMetrics.find((item) => item.key === incident.metric_key) ?? resourceMetrics[0],
  );
  return (
    <>
      <p className="incident-evidence-range">
        {incidentTime(data.from)} ~ {incidentTime(data.to)}
        <span>선택 시각 전후 15분</span>
      </p>
      <Tabs activeKey={tab} onSelect={(_, key) => setTab(key)} aria-label="장애 조사 자료">
        <Tab eventKey="resources" title="자원 추이">
          {incident.instance_id ? (
            <>
              <div className="incident-metric-options" role="group" aria-label="자원 지표">
                {resourceMetrics.map((item) => (
                  <Button
                    key={item.key}
                    variant="secondary"
                    aria-pressed={metric.key === item.key}
                    onClick={() => setMetric(item)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
              <p className="field-help">
                1분 단위 최대 사용률입니다. 수집되지 않은 구간은 빈 구간으로 표시합니다.
              </p>
              {!data.resources.length ? (
                <Empty>이 구간에 수집된 자원 데이터가 없습니다.</Empty>
              ) : (
                <MetricChart
                  key={metric.key}
                  title={metric.label}
                  points={data.resources}
                  xKey="sampled_at"
                  yKey={metric.field}
                  unit="ratio"
                />
              )}
            </>
          ) : (
            <p>연결된 인스턴스가 없는 프로젝트 공통 항목입니다.</p>
          )}
        </Tab>
        <Tab eventKey="checks" title="점검 결과">
          <h4>
            API · 내부 점검 <small>수신 시각 기준 최근 100건</small>
          </h4>
          {!data.checks.length ? (
            <Empty>이 구간에 보관된 점검 결과가 없습니다.</Empty>
          ) : (
            <Table aria-label="장애 시간대 점검 결과">
              <Thead>
                <Tr>
                  <Th>서버 · 항목</Th>
                  <Th>실행 시각</Th>
                  <Th>수신 시각</Th>
                  <Th>상태</Th>
                  <Th>응답시간</Th>
                  <Th>결과 코드</Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.checks.map((check, index) => (
                  <Tr key={`${check.instance_id}/${check.check_id}/${index}`}>
                    <Td>
                      {check.instance_id} · {check.name ?? check.check_id}
                    </Td>
                    <Td>{incidentTime(check.checked_at)}</Td>
                    <Td>{incidentTime(check.central_received_at)}</Td>
                    <Td>
                      <StatusLabel status={check.status} context="check" />
                    </Td>
                    <Td>{check.duration_ms == null ? '—' : `${check.duration_ms}ms`}</Td>
                    <Td>{check.result_code ?? '—'}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Tab>
        <Tab eventKey="logs" title="보관 로그">
          <h4>보관 로그</h4>
          <p className="field-help">
            수신 시각 기준 최근 20개 구간, 구간당 앞 8,192자입니다. 기존에 조회·보관된 WSS 로그만
            표시하며 원문 시각은 본문에서 확인하세요.
          </p>
          {!data.logs_allowed ? (
            <p>원문 로그 조회 권한이 없습니다.</p>
          ) : !data.logs.length ? (
            <Empty>
              이 구간에 보관된 로그가 없습니다. HTTP 로그나 보관 기간이 지난 로그는 표시되지
              않습니다.
            </Empty>
          ) : (
            data.logs.map((log) => (
              <details key={log.id}>
                <summary>
                  {incidentTime(log.received_at)} · 로그 #{log.id}
                </summary>
                <pre className="incident-log">{log.text ?? '본문 없음'}</pre>
              </details>
            ))
          )}
        </Tab>
        <Tab eventKey="changes" title="설정 변경">
          <h4>
            프로젝트 설정 변경 <small>최근 100건</small>
          </h4>
          {!data.changes_allowed ? (
            <p>설정 변경 이력은 관리자만 조회할 수 있습니다.</p>
          ) : !data.changes.length ? (
            <Empty>이 구간에 기록된 프로젝트 설정 변경이 없습니다.</Empty>
          ) : (
            <Table aria-label="장애 시간대 설정 변경">
              <Thead>
                <Tr>
                  <Th>시각</Th>
                  <Th>변경자</Th>
                  <Th>대상</Th>
                  <Th>작업</Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.changes.map((change) => (
                  <Tr key={change.audit_id}>
                    <Td>{incidentTime(change.occurred_at)}</Td>
                    <Td>{change.actor}</Td>
                    <Td>
                      {change.entity_type} · {change.target_id}
                    </Td>
                    <Td>{change.action}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Tab>
      </Tabs>
    </>
  );
}

const resourceMetrics = [
  { key: 'SYSTEM_CPU', label: '시스템 CPU', field: 'system_cpu_ratio' },
  { key: 'JVM_HEAP', label: 'JVM Heap', field: 'heap_ratio' },
  { key: 'PHYSICAL_MEMORY', label: '물리 메모리', field: 'memory_ratio' },
  { key: 'DISK', label: '디스크', field: 'disk_ratio' },
  { key: 'DB_POOL', label: 'DB 풀', field: 'db_pool_ratio' },
];

const eventLabels: Record<string, string> = {
  OPENED: '장애 감지',
  ACKNOWLEDGED: '확인 완료',
  IN_PROGRESS: '조치 시작',
  ASSIGNED: '담당자 변경',
  COMMENT: '조치 메모',
  RECOVERED: '정상 복구 확인',
  MONITORING_STOPPED: '감시 중지',
  STATUS_CHANGED: '판정 상태 변경',
};
