// 중앙 저장 이력으로 요청 분포와 수집 데이터 기준 요약 표시
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DefaultService } from '../generated';
import XlogChart, { type XlogItem, type XlogZoom } from './XlogChart';
import { ProDescriptions, ProTable, type ProColumns } from '@ant-design/pro-components';
import { Alert, Button, Card, Modal, Statistic, Typography, theme } from 'antd';
import { Empty, Failure, Loading } from './QueryState';

const PAGE_SIZE = 20;

function formatRequestTime(startedAt: number) {
  return new Date(startedAt).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
}

function formatRequestDateTime(startedAt: number) {
  return `${new Date(startedAt).toLocaleDateString('ko-KR')} ${formatRequestTime(startedAt)}`;
}

export default function XlogOverview({
  project = '',
  instance = '',
  minutes = 60,
  path = '',
  errorsOnly = false,
  detailed = false,
  compact = false,
}: {
  project?: string;
  instance?: string;
  minutes?: number;
  path?: string;
  errorsOnly?: boolean;
  detailed?: boolean;
  compact?: boolean;
}) {
  const { token } = theme.useToken();
  const [selected, select] = useState<XlogItem>();
  const [beforeId, setBeforeId] = useState(0);
  const [page, setPage] = useState(0);
  const choose = useCallback((item: XlogItem) => select(item), []);
  const scope = JSON.stringify([project, instance, minutes, path, errorsOnly, beforeId]);
  const [zoomSelection, setZoomSelection] = useState<{ scope: string; zoom?: XlogZoom }>({
    scope,
  });
  const zoom = zoomSelection.scope === scope ? zoomSelection.zoom : undefined;
  const onZoomChange = useCallback(
    (next?: XlogZoom) => setZoomSelection({ scope, zoom: next }),
    [scope],
  );
  useEffect(() => {
    // 필터와 페이지 전환에서는 이전 조회의 시각 선택을 폐기
    setZoomSelection({ scope });
  }, [scope]);
  const query = useQuery({
    queryKey: ['xlog', project, instance, minutes, path, errorsOnly, beforeId],
    queryFn: () =>
      DefaultService.getXlog({ project, instance, minutes, path, errorsOnly, beforeId }),
    refetchInterval: beforeId === 0 ? 5000 : false,
    retry: false,
  });
  if (query.isPending) {
    return <Loading />;
  }
  if (!query.data) {
    return <Failure />;
  }
  const { items, summary, enabled_projects, eligible_instances, connected_instances } = query.data;
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const activePage = Math.min(page, pageCount - 1);
  const visibleItems = items.slice(activePage * PAGE_SIZE, (activePage + 1) * PAGE_SIZE);
  const startedTimes = items.map((item) => item.payload.started_at);
  const observedRange = startedTimes.length
    ? [Math.min(...startedTimes), Math.max(...startedTimes)]
    : undefined;
  const columns: ProColumns<XlogItem>[] = [
    {
      title: '시각',
      dataIndex: ['payload', 'started_at'],
      render: (_, item) => formatRequestTime(item.payload.started_at),
    },
    {
      title: '프로젝트 / 인스턴스',
      dataIndex: 'project_name',
      render: (_, item) => `${item.project_name} / ${item.instance_name}`,
    },
    {
      title: '요청',
      dataIndex: ['payload', 'path'],
      render: (_, item) => (
        <Button type="link" onClick={() => choose(item)}>
          {item.payload.method} {item.payload.path}
        </Button>
      ),
    },
    {
      title: '응답시간',
      dataIndex: ['payload', 'duration_ms'],
      render: (_, item) => `${item.payload.duration_ms} ms`,
    },
    { title: 'HTTP', dataIndex: ['payload', 'status'] },
  ];

  if (!detailed && !compact && !enabled_projects && !items.length) {
    return null;
  }
  const Section = detailed ? Card : 'div';
  const content = (
    <>
      {!compact && enabled_projects > 0 && (
        <p className="xlog-connection-status">
          {!eligible_instances
            ? 'XLog 수집에는 사용 중인 인스턴스의 웹소켓 설정이 필요합니다.'
            : connected_instances
              ? `웹소켓 연결 ${connected_instances}/${eligible_instances} · 연결된 서버의 요청 수집 중`
              : '웹소켓 연결 끊김 · 수집이 중단되어 저장된 요청만 표시합니다.'}
        </p>
      )}
      {query.isError && <Alert type="warning" title="갱신에 실패해 마지막 기록을 표시합니다." />}
      <Section
        {...(detailed ? { size: 'small' as const } : {})}
        role={detailed ? 'region' : undefined}
        aria-label={detailed ? 'XLog 요청 요약' : undefined}
        className={detailed ? 'xlog-summary-surface' : 'xlog-inline-surface'}
      >
        <div className={compact ? 'xlog-chart-summary' : 'xlog-kpis'}>
          <Link
            aria-label={`수집 요청 ${summary.count.toLocaleString()}건 보기`}
            to={`/xlog?${new URLSearchParams({ project, instance })}`}
          >
            <Statistic
              title="수집 요청"
              value={summary.count}
              suffix="건"
              styles={{ content: { fontSize: token.fontSizeHeading3 } }}
            />
          </Link>
          <Link
            aria-label={`HTTP 오류 ${summary.errors.toLocaleString()}건 보기`}
            to={`/xlog?${new URLSearchParams({ project, instance, errorsOnly: 'true' })}`}
          >
            <Statistic
              title="HTTP 오류"
              value={summary.errors}
              suffix="건"
              styles={{
                content: {
                  fontSize: token.fontSizeHeading3,
                  color: summary.errors ? token.colorError : undefined,
                },
              }}
            />
          </Link>
          <Statistic
            title="평균 응답시간"
            value={summary.count ? Math.round(summary.average_ms) : '—'}
            suffix="ms"
            styles={{ content: { fontSize: token.fontSizeHeading3 } }}
          />
          <Statistic
            title="P95 응답시간"
            value={summary.count ? Math.round(summary.p95_ms) : '—'}
            suffix="ms"
            styles={{ content: { fontSize: token.fontSizeHeading3 } }}
          />
        </div>
      </Section>
      <Section
        {...(detailed ? { size: 'small' as const, title: 'XLog · 요청 응답시간 분포' } : {})}
        className={detailed ? 'xlog-plot-panel' : 'xlog-inline-surface'}
        role={detailed ? 'region' : undefined}
        aria-label={detailed ? 'XLog 요청 응답시간 분포' : undefined}
      >
        {items.length ? (
          <XlogChart
            key={scope}
            items={items}
            onSelect={choose}
            rangeMinutes={minutes}
            rangeEnd={query.dataUpdatedAt}
            zoom={zoom}
            onZoomChange={onZoomChange}
          />
        ) : (
          <>
            <Empty>
              {enabled_projects
                ? '수집된 요청이 없습니다. 인스턴스의 웹소켓 연결 상태와 조회 기간을 확인하세요.'
                : 'XLog 미사용입니다. 저장된 이력은 조회할 수 있습니다.'}
            </Empty>
            {zoom && <Button onClick={() => onZoomChange(undefined)}>확대 초기화</Button>}
          </>
        )}
        {!compact && (
          <p className="xlog-data-note">
            최근 {minutes < 60 ? `${minutes}분` : `${minutes / 60}시간`}의 보관 중인 수집 데이터
            기준 · 차트 최대 1,000건 · 점을 클릭하면 요청 정보를 확인합니다.
          </p>
        )}
      </Section>
      {detailed && (
        <Card
          size="small"
          className="xlog-list-panel"
          role="region"
          aria-label="XLog 요청 목록"
          title="XLog 요청 목록"
        >
          {observedRange && (
            <p className="xlog-data-note">
              표시된 요청 시각 (반환된 {items.length.toLocaleString()}건):{' '}
              {formatRequestDateTime(observedRange[0])} ~ {formatRequestDateTime(observedRange[1])}
            </p>
          )}
          <ProTable<XlogItem>
            aria-label="XLog 요청 목록"
            rowKey="id"
            columns={columns}
            dataSource={visibleItems}
            search={false}
            options={false}
            pagination={false}
            scroll={{ x: 'max-content' }}
          />
          <div className="xlog-pagination" aria-label="XLog 요청 페이지 이동">
            <span>조회한 {items.length.toLocaleString()}건 · 페이지당 20건</span>
            <Button disabled={activePage === 0} onClick={() => setPage(activePage - 1)}>
              이전 페이지
            </Button>
            <span aria-live="polite">
              {activePage + 1} / {pageCount} 페이지
            </span>
            <Button disabled={activePage >= pageCount - 1} onClick={() => setPage(activePage + 1)}>
              다음 페이지
            </Button>
          </div>
          <div className="xlog-pagination">
            <Button
              disabled={!beforeId}
              onClick={() => {
                setBeforeId(0);
                setPage(0);
              }}
            >
              최근 기록
            </Button>
            <Button
              disabled={items.length < 1000}
              onClick={() => {
                setBeforeId(items.at(-1)?.id ?? 0);
                setPage(0);
              }}
            >
              이전 기록
            </Button>
          </div>
        </Card>
      )}
      {selected && (
        <Modal
          open
          title="요청 정보"
          onCancel={() => select(undefined)}
          footer={<Button onClick={() => select(undefined)}>닫기</Button>}
        >
          <ProDescriptions
            column={1}
            bordered
            dataSource={{
              scope: `${selected.project_name} / ${selected.instance_name}`,
              started: formatRequestDateTime(selected.payload.started_at),
              request: `${selected.payload.method} ${selected.payload.path}`,
              duration: `${selected.payload.duration_ms} ms`,
              status: selected.payload.status,
            }}
            columns={[
              { title: '프로젝트 / 인스턴스', dataIndex: 'scope' },
              { title: '시각', dataIndex: 'started' },
              { title: '요청', dataIndex: 'request' },
              { title: '응답시간', dataIndex: 'duration' },
              { title: 'HTTP 결과', dataIndex: 'status' },
            ]}
          />
        </Modal>
      )}
    </>
  );
  if (detailed) {
    return <div className="xlog-overview xlog-detailed">{content}</div>;
  }
  return (
    <Card
      size="small"
      styles={{ header: { paddingInline: token.padding }, body: { padding: token.padding } }}
      className={compact ? 'metric-chart-card xlog-chart-card' : 'xlog-overview'}
      role={compact ? 'region' : undefined}
      aria-label={compact ? 'XLog 그래프' : undefined}
      title={
        <Typography.Title level={compact ? 3 : 2} style={{ fontSize: token.fontSizeLG, margin: 0 }}>
          XLog{' '}
          <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM, fontWeight: 400 }}>
            {compact ? `최근 ${minutes / 60}시간` : '요청 응답시간'}
          </Typography.Text>
        </Typography.Title>
      }
      extra={<Link to={`/xlog?${new URLSearchParams({ project, instance })}`}>요청 기록 →</Link>}
    >
      {content}
    </Card>
  );
}
