// 중앙에 저장된 요청 요약과 조회한 로그 기록 표시
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { DefaultService } from '../generated';
import { Button, Space } from 'antd';
import { ProTable, type ProColumns } from '@ant-design/pro-components';
import { Empty, Failure, Loading } from './QueryState';

type CollectorEvent = Awaited<
  ReturnType<typeof DefaultService.getCollectorEvents>
>['items'][number];
const columns: ProColumns<CollectorEvent>[] = [
  { title: '시각', render: (_, item) => new Date(item.payload.started_at ?? 0).toLocaleString() },
  { title: '요청', render: (_, item) => `${item.payload.method} ${item.payload.path}` },
  { title: '처리 시간', render: (_, item) => `${item.payload.duration_ms} ms` },
  { title: 'HTTP 결과', render: (_, item) => item.payload.status },
];

export default function CollectorEvents({
  projectId,
  instanceId,
  kind = 'XLOG',
}: {
  projectId: string;
  instanceId: string;
  kind?: 'XLOG' | 'LOG';
}) {
  const [beforeId, setBeforeId] = useState(0);
  const query = useQuery({
    queryKey: ['collector-events', projectId, instanceId, kind, beforeId],
    queryFn: () => DefaultService.getCollectorEvents({ projectId, instanceId, kind, beforeId }),
    refetchInterval: beforeId === 0 ? 5000 : false,
    retry: false,
  });
  if (query.isPending) {
    return <Loading />;
  }
  if (!query.data) {
    return <Failure />;
  }
  const items = query.data.items;
  const maxDuration = Math.max(1, ...items.map((item) => item.payload.duration_ms ?? 0));
  const start = Math.min(...items.map((item) => item.payload.started_at ?? 0));
  const end = Math.max(...items.map((item) => item.payload.started_at ?? 0));
  return (
    <section className="collector-events">
      {kind === 'XLOG' && (
        <>
          <p>웹 요청의 시작 시각·처리 시간·HTTP 결과입니다. SQL 추적은 포함하지 않습니다.</p>
          {items.length > 0 && (
            <svg
              className="xlog-chart"
              viewBox="0 0 1000 240"
              role="img"
              aria-label="XLog 요청 처리 시간 분포"
            >
              <text x="5" y="18">
                {maxDuration} ms
              </text>
              <line x1="70" x2="985" y1="210" y2="210" stroke="currentColor" opacity="0.3" />
              {items.map((item) => (
                <circle
                  key={item.id}
                  cx={
                    75 +
                    (((item.payload.started_at ?? start) - start) / Math.max(1, end - start)) * 900
                  }
                  cy={205 - ((item.payload.duration_ms ?? 0) / maxDuration) * 175}
                  r="4"
                  fill={(item.payload.status ?? 200) >= 400 ? '#ef6262' : '#a78bfa'}
                >
                  <title>
                    {item.payload.method} {item.payload.path}: {item.payload.duration_ms} ms ·{' '}
                    {item.payload.status}
                  </title>
                </circle>
              ))}
              <text x="75" y="235">
                {new Date(start).toLocaleTimeString()}
              </text>
              <text x="890" y="235">
                {new Date(end).toLocaleTimeString()}
              </text>
            </svg>
          )}
        </>
      )}
      {items.length === 0 ? (
        <Empty />
      ) : kind === 'XLOG' ? (
        <ProTable<CollectorEvent>
          aria-label="XLog 요청 목록"
          rowKey="id"
          columns={columns}
          dataSource={items}
          search={false}
          options={false}
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
      ) : (
        items.map((item) => (
          <article key={item.id}>
            <time>{new Date(item.received_at).toLocaleString()}</time>
            <pre className="log-output">{item.payload.text}</pre>
          </article>
        ))
      )}
      <Space wrap>
        <Button onClick={() => setBeforeId(0)}>최신 기록</Button>
        <Button disabled={items.length < 100} onClick={() => setBeforeId(items.at(-1)?.id ?? 0)}>
          이전 기록
        </Button>
      </Space>
    </section>
  );
}
