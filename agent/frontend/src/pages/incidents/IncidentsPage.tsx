// 진행 중·복구된 장애 관리대장과 프로젝트별 조사 화면 진입
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { getIncidents } from '../../api';
import { Incident } from '../../generated';
import { useProjectScope } from '../../components/ProjectScope';
import { Empty, Failure, Loading, RefreshFailure } from '../../components/QueryState';
import StatusLabel from '../../components/StatusLabel';
import { Button, Label, Table, Tbody, Td, Th, Thead, Tr } from '../../components/ui';
import {
  incidentDuration,
  incidentKinds,
  incidentStates,
  incidentTime,
  incidentTitle,
  observationSummary,
} from './presentation';
import './incidents.css';

export default function IncidentsPage() {
  const { project } = useProjectScope();
  const [params, setParams] = useSearchParams();
  const requested = params.get('state') ?? 'ACTIVE';
  const state =
    requested === '' || requested === 'ACTIVE'
      ? requested
      : (Object.values(Incident.state).find((value) => value === requested) ?? 'ACTIVE');
  const page = Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0);
  const query = useQuery({
    queryKey: ['incidents', project, state, page],
    queryFn: () => getIncidents(project, state, page),
    refetchInterval: 15_000,
  });
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    if (key !== 'page') {
      next.delete('page');
    }
    setParams(next);
  };
  return (
    <div className="incident-page">
      <div className="incident-heading">
        <p className="api-page-help">
          처리할 장애를 확인하고, 항목을 눌러 원인과 조치 기록을 확인하세요.
        </p>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          새로고침
        </Button>
      </div>
      <div className="incident-filters" role="group" aria-label="장애 상태 필터">
        {[['ACTIVE', '진행 중'], ...Object.entries(incidentStates), ['', '전체 이력']].map(
          ([value, label]) => (
            <Button
              key={value}
              variant="secondary"
              aria-pressed={state === value}
              onClick={() => change('state', value)}
            >
              {label}
            </Button>
          ),
        )}
      </div>
      <RefreshFailure
        visible={query.isError && Boolean(query.data)}
        updatedAt={query.dataUpdatedAt}
        retry={() => void query.refetch()}
      />
      {query.isPending ? (
        <Loading />
      ) : !query.data ? (
        <Failure />
      ) : (
        <>
          <p className="incident-list-count">
            <strong>
              {state === 'ACTIVE' ? '진행 중' : state === '' ? '전체 이력' : incidentStates[state]}{' '}
              {query.data.total}건
            </strong>
            <span>최근 감지된 순서 · {page + 1}페이지</span>
          </p>
          {!query.data.items.length ? (
            <Empty>
              선택한 조건의 장애가 없습니다. 기능 적용 이후 감지한 경고·위험부터 기록합니다.
            </Empty>
          ) : (
            <Table aria-label="장애 관리대장" className="incident-list">
              <Thead>
                <Tr>
                  <Th>처리 상태</Th>
                  <Th>장애 내용 · 대상</Th>
                  <Th>최초 감지 · 지속 시간</Th>
                  <Th>담당자</Th>
                </Tr>
              </Thead>
              <Tbody>
                {query.data.items.map((item) => (
                  <Tr key={item.incident_id}>
                    <Td>
                      <Label className={`incident-state incident-state-${item.state}`}>
                        {incidentStates[item.state]}
                      </Label>
                      <small className="incident-meta">{incidentKinds[item.kind]}</small>
                    </Td>
                    <Td>
                      <div className="incident-item-title">
                        <Link
                          to={`/incidents/${item.incident_id}?${new URLSearchParams({ project: item.project_id })}`}
                        >
                          {incidentTitle(item)}
                        </Link>
                        <StatusLabel
                          status={item.latest_observation.status}
                          context={
                            item.kind === 'COLLECTION'
                              ? 'collection'
                              : item.kind === 'METRIC'
                                ? undefined
                                : 'check'
                          }
                        />
                      </div>
                      <small className="incident-meta">
                        {item.project_name} · {item.instance_name ?? '프로젝트 공통'}
                      </small>
                      <p className="incident-row-summary">
                        {observationSummary(item.latest_observation)}
                      </p>
                    </Td>
                    <Td>
                      <time dateTime={item.opened_at}>{incidentTime(item.opened_at)}</time>
                      <small className="incident-meta">
                        {incidentDuration(item)} {item.closed_at ? '후 종료' : '경과'}
                      </small>
                    </Td>
                    <Td>{item.assignee ?? '미지정'}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
          <div className="incident-toolbar">
            <Button
              variant="secondary"
              isDisabled={page === 0}
              onClick={() => change('page', String(page - 1))}
            >
              이전
            </Button>
            <Button
              variant="secondary"
              isDisabled={(page + 1) * query.data.size >= query.data.total}
              onClick={() => change('page', String(page + 1))}
            >
              다음
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
