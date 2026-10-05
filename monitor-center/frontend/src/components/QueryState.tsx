// 조회 중·실패·빈 결과 상태 표시
import { Alert, Button, EmptyState, EmptyStateBody, Spinner } from './ui';
import type { ReactNode } from 'react';

export function Loading() {
  return (
    <div className="query-state loading-state" role="status">
      <Spinner size="md" aria-label="데이터 로딩" />
      <span>데이터를 불러오는 중입니다.</span>
      <span className="skeleton-row" aria-hidden="true" />
      <span className="skeleton-row short" aria-hidden="true" />
    </div>
  );
}

export function Failure({ message = '데이터를 불러오지 못했습니다.' }: { message?: string }) {
  return (
    <Alert
      variant="danger"
      title={message}
      actionLinks={
        <Button variant="link" onClick={() => window.location.reload()}>
          다시 시도
        </Button>
      }
    >
      네트워크 연결과 서버 상태를 확인한 뒤 다시 시도해 주세요.
    </Alert>
  );
}

export function Empty({ children = '표시할 데이터가 없습니다.' }: { children?: ReactNode }) {
  return (
    <EmptyState className="query-state empty-state" titleText="데이터 없음" headingLevel="h2">
      <EmptyStateBody>{children}</EmptyStateBody>
    </EmptyState>
  );
}

export function Stale({ visible }: { visible?: boolean }) {
  return visible ? (
    <Alert className="stale" variant="warning" title="마지막 정상 데이터를 표시합니다.">
      새 수집 결과가 지연되고 있습니다. 최근 수집 시각을 확인해 주세요.
    </Alert>
  ) : null;
}

export function RefreshFailure({
  visible,
  updatedAt,
  retry,
}: {
  visible: boolean;
  updatedAt: number;
  retry: () => void;
}) {
  return visible ? (
    <Alert
      variant="warning"
      title="갱신에 실패해 이전 데이터를 표시합니다."
      actionLinks={
        <Button variant="link" onClick={retry}>
          다시 시도
        </Button>
      }
    >
      {updatedAt > 0 && `마지막 갱신: ${new Date(updatedAt).toLocaleString('ko-KR')}`}
    </Alert>
  ) : null;
}
