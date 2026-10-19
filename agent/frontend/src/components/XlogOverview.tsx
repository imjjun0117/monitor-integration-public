// 중앙 저장 이력으로 요청 분포와 수집 데이터 기준 요약 표시
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { DefaultService } from '../generated';
import XlogChart, { type XlogItem } from './XlogChart';
import {
  Alert,
  Button,
  Modal,
  ModalHeader,
  ModalBody,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
} from './ui';
import { Empty, Failure, Loading } from './QueryState';

const PAGE_SIZE = 20;

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
  const [selected, select] = useState<XlogItem>();
  const [beforeId, setBeforeId] = useState(0);
  const [page, setPage] = useState(0);
  const choose = useCallback((item: XlogItem) => select(item), []);
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

  if (!detailed && !enabled_projects && !items.length) {
    return null;
  }
  return (
    <section
      className={compact ? 'metric-chart-card xlog-chart-card' : 'xlog-overview'}
      aria-label={compact ? 'XLog 그래프' : undefined}
    >
      <div className="xlog-heading">
        <h2 className={compact ? 'metric-chart-title' : undefined}>
          XLog <span>{compact ? `최근 ${minutes / 60}시간` : '요청 응답시간'}</span>
        </h2>
        <Link to={`/xlog?${new URLSearchParams({ project, instance })}`}>요청 기록 →</Link>
      </div>
      {!compact && enabled_projects > 0 && (
        <p className="xlog-connection-status">
          {!eligible_instances
            ? 'XLog 수집에는 사용 중인 인스턴스의 웹소켓 설정이 필요합니다.'
            : connected_instances
              ? `웹소켓 연결 ${connected_instances}/${eligible_instances} · 연결된 서버의 요청 수집 중`
              : '웹소켓 연결 끊김 · 수집이 중단되어 저장된 요청만 표시합니다.'}
        </p>
      )}
      {query.isError && <Alert variant="warning" title="갱신에 실패해 마지막 기록을 표시합니다." />}
      <div className={compact ? 'xlog-chart-summary' : 'xlog-kpis'}>
        <div>
          <span>수집 요청</span>
          <Link to={`/xlog?${new URLSearchParams({ project, instance })}`}>
            <strong>
              {summary.count.toLocaleString()}
              <small>건</small>
            </strong>
          </Link>
        </div>
        <div className="xlog-error-kpi">
          <span>HTTP 오류</span>
          <Link to={`/xlog?${new URLSearchParams({ project, instance, errorsOnly: 'true' })}`}>
            <strong>
              {summary.errors.toLocaleString()}
              <small>건</small>
            </strong>
          </Link>
        </div>
        <div>
          <span>평균 응답시간</span>
          <strong>
            {summary.count ? Math.round(summary.average_ms).toLocaleString() : '—'}
            <small>ms</small>
          </strong>
        </div>
        <div>
          <span>P95 응답시간</span>
          <strong>
            {summary.count ? Math.round(summary.p95_ms).toLocaleString() : '—'}
            <small>ms</small>
          </strong>
        </div>
      </div>
      {items.length ? (
        <XlogChart items={items} onSelect={choose} />
      ) : (
        <Empty>
          {enabled_projects
            ? '수집된 요청이 없습니다. 인스턴스의 웹소켓 연결 상태와 조회 기간을 확인하세요.'
            : 'XLog 미사용입니다. 저장된 이력은 조회할 수 있습니다.'}
        </Empty>
      )}
      {!compact && (
        <p className="xlog-data-note">
          최근 {minutes < 60 ? `${minutes}분` : `${minutes / 60}시간`}의 보관 중인 수집 데이터 기준
          · 차트 최대 1,000건 · 점을 클릭하면 요청 정보를 확인합니다.
        </p>
      )}
      {detailed && (
        <>
          <div className="settings-table-scroll">
            <Table aria-label="XLog 요청 목록">
              <Thead>
                <Tr>
                  <Th>시각</Th>
                  <Th>프로젝트 / 인스턴스</Th>
                  <Th>요청</Th>
                  <Th>응답시간</Th>
                  <Th>HTTP</Th>
                </Tr>
              </Thead>
              <Tbody>
                {visibleItems.map((item) => (
                  <Tr key={item.id}>
                    <Td>{new Date(item.payload.started_at).toLocaleTimeString()}</Td>
                    <Td>
                      {item.project_name} / {item.instance_name}
                    </Td>
                    <Td>
                      <Button variant="link" onClick={() => choose(item)}>
                        {item.payload.method} {item.payload.path}
                      </Button>
                    </Td>
                    <Td>{item.payload.duration_ms} ms</Td>
                    <Td>{item.payload.status}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
          <div className="xlog-pagination" aria-label="XLog 요청 페이지 이동">
            <span>조회한 {items.length.toLocaleString()}건 · 페이지당 20건</span>
            <Button
              variant="secondary"
              isDisabled={activePage === 0}
              onClick={() => setPage(activePage - 1)}
            >
              이전 페이지
            </Button>
            <span aria-live="polite">
              {activePage + 1} / {pageCount} 페이지
            </span>
            <Button
              variant="secondary"
              isDisabled={activePage >= pageCount - 1}
              onClick={() => setPage(activePage + 1)}
            >
              다음 페이지
            </Button>
          </div>
          <div className="xlog-pagination">
            <Button
              variant="secondary"
              isDisabled={!beforeId}
              onClick={() => {
                setBeforeId(0);
                setPage(0);
              }}
            >
              최근 기록
            </Button>
            <Button
              variant="secondary"
              isDisabled={items.length < 1000}
              onClick={() => {
                setBeforeId(items.at(-1)?.id ?? 0);
                setPage(0);
              }}
            >
              이전 기록
            </Button>
          </div>
        </>
      )}
      {selected && (
        <Modal isOpen onClose={() => select(undefined)} aria-label="요청 정보">
          <ModalHeader title="요청 정보" />
          <ModalBody>
            <dl className="request-detail">
              <dt>프로젝트 / 인스턴스</dt>
              <dd>
                {selected.project_name} / {selected.instance_name}
              </dd>
              <dt>시각</dt>
              <dd>{new Date(selected.payload.started_at).toLocaleString()}</dd>
              <dt>요청</dt>
              <dd>
                {selected.payload.method} {selected.payload.path}
              </dd>
              <dt>응답시간</dt>
              <dd>{selected.payload.duration_ms} ms</dd>
              <dt>HTTP 결과</dt>
              <dd>{selected.payload.status}</dd>
            </dl>
          </ModalBody>
        </Modal>
      )}
    </section>
  );
}
