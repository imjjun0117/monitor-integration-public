// 조회 중·실패·빈 결과 상태 표시
import { Alert, Button, Empty as AntEmpty, Spin } from 'antd';
import type { ReactNode } from 'react';

export function Loading() {
  return (
    <div role="status">
      <Spin description="데이터를 불러오는 중입니다.">
        <div style={{ minHeight: 120 }} />
      </Spin>
    </div>
  );
}

export function Failure({ message = '데이터를 불러오지 못했습니다.' }: { message?: string }) {
  return (
    <Alert
      type="error"
      showIcon
      message={message}
      description="네트워크 연결과 서버 상태를 확인한 뒤 다시 시도해 주세요."
      action={
        <Button type="link" onClick={() => window.location.reload()}>
          다시 시도
        </Button>
      }
    />
  );
}

export function Empty({ children = '표시할 데이터가 없습니다.' }: { children?: ReactNode }) {
  return (
    <AntEmpty
      description={
        <>
          <strong>데이터 없음</strong>
          <div>{children}</div>
        </>
      }
    />
  );
}

export function Stale({ visible }: { visible?: boolean }) {
  return visible ? (
    <Alert
      type="warning"
      showIcon
      message="마지막 정상 데이터를 표시합니다."
      description="새 수집 결과가 지연되고 있습니다. 최근 수집 시각을 확인해 주세요."
    />
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
      type="warning"
      showIcon
      message="갱신에 실패해 이전 데이터를 표시합니다."
      description={
        updatedAt > 0 ? `마지막 갱신: ${new Date(updatedAt).toLocaleString('ko-KR')}` : undefined
      }
      action={
        <Button type="link" onClick={retry}>
          다시 시도
        </Button>
      }
    />
  ) : null;
}
