// 진행 중·복구된 장애 관리대장과 프로젝트별 조사 화면 진입
import { ProTable, type ProColumns } from '@ant-design/pro-components';
import { Button, Flex, Grid, Pagination, Select, Space, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { getIncidents } from '../../api';
import { Incident } from '../../generated';
import { useProjectScope } from '../../components/ProjectScope';
import { Empty, Failure, Loading, RefreshFailure } from '../../components/QueryState';
import StatusLabel from '../../components/StatusLabel';
import {
  incidentDuration,
  incidentKinds,
  incidentStates,
  incidentTime,
  incidentTitle,
  observationSummary,
} from './presentation';
import './incidents.css';

const PAGE_SIZE = 50;
const STATE_OPTIONS = [
  ['ACTIVE', '진행 중'],
  ...Object.entries(incidentStates),
  ['', '전체 이력'],
].map(([value, label]) => ({ value, label }));

export default function IncidentsPage() {
  const { project } = useProjectScope();
  const screens = Grid.useBreakpoint();
  const compact = !screens.md;
  const columns: ProColumns<Incident>[] = [
    {
      title: '처리 상태',
      width: 120,
      responsive: ['md'],
      render: (_, item) => (
        <Space direction="vertical">
          <Tag>{incidentStates[item.state]}</Tag>
          <small>{incidentKinds[item.kind]}</small>
        </Space>
      ),
    },
    {
      title: '장애 내용 · 대상',
      render: (_, item) => (
        <div className="incident-row-summary">
          {compact && <Tag>{incidentStates[item.state]}</Tag>}
          <Space wrap>
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
          </Space>
          <div>
            {item.project_name} · {item.instance_name ?? '프로젝트 공통'}
          </div>
          <Typography.Paragraph style={{ marginBlock: 8 }}>
            {observationSummary(item.latest_observation)}
          </Typography.Paragraph>
          {compact && (
            <Space direction="vertical" size={0}>
              <Typography.Text type="secondary">
                {incidentKinds[item.kind]} · 담당자 {item.assignee ?? '미지정'}
              </Typography.Text>
              <Typography.Text type="secondary">
                <time dateTime={item.opened_at}>{incidentTime(item.opened_at)}</time>
                {' · '}
                {incidentDuration(item)} {item.closed_at ? '후 종료' : '경과'}
              </Typography.Text>
            </Space>
          )}
        </div>
      ),
    },
    {
      title: '최초 감지 · 지속 시간',
      width: 200,
      responsive: ['md'],
      render: (_, item) => (
        <Space direction="vertical">
          <time dateTime={item.opened_at}>{incidentTime(item.opened_at)}</time>
          <small>
            {incidentDuration(item)} {item.closed_at ? '후 종료' : '경과'}
          </small>
        </Space>
      ),
    },
    {
      title: '담당자',
      width: 120,
      responsive: ['md'],
      render: (_, item) => item.assignee ?? '미지정',
    },
  ];
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
      <Typography.Paragraph style={{ margin: 0 }} type="secondary">
        처리할 장애를 확인하고, 항목을 눌러 원인과 조치 기록을 확인하세요.
      </Typography.Paragraph>
      <Flex gap="small" align="center" justify="space-between" wrap>
        {compact ? (
          <Select
            aria-label="장애 상태 필터"
            value={state}
            onChange={(value) => change('state', value)}
            style={{ flex: 1, minWidth: 160 }}
            options={STATE_OPTIONS}
          />
        ) : (
          <Space wrap role="group" aria-label="장애 상태 필터">
            {STATE_OPTIONS.map(({ value, label }) => (
              <Button
                key={value}
                aria-pressed={state === value}
                type={state === value ? 'primary' : 'default'}
                onClick={() => change('state', value)}
              >
                {label}
              </Button>
            ))}
          </Space>
        )}
        <Button loading={query.isFetching} onClick={() => void query.refetch()}>
          새로고침
        </Button>
      </Flex>
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
          <Flex gap="small" align="baseline" wrap>
            <Typography.Text strong>
              {state === 'ACTIVE' ? '진행 중' : state === '' ? '전체 이력' : incidentStates[state]}{' '}
              {query.data.total}건
            </Typography.Text>
            <Typography.Text type="secondary">최근 감지된 순서 · {page + 1}페이지</Typography.Text>
          </Flex>
          {!query.data.items.length ? (
            <Empty>
              선택한 조건의 장애가 없습니다. 기능 적용 이후 감지한 경고·위험부터 기록합니다.
            </Empty>
          ) : (
            <>
              <ProTable<Incident>
                aria-label="장애 관리대장"
                rowKey="incident_id"
                columns={columns}
                dataSource={query.data.items}
                search={false}
                options={false}
                cardProps={false}
                tableLayout="fixed"
                scroll={compact ? undefined : { x: 800 }}
                pagination={false}
              />
              <Pagination
                align="end"
                responsive
                current={page + 1}
                pageSize={query.data.size || PAGE_SIZE}
                total={query.data.total}
                showSizeChanger={false}
                onChange={(current) => change('page', String(current - 1))}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
