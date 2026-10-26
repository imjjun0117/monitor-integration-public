// 상세 화면의 수동 연결 제어
import { Alert, Button, Card, Space, Tag, Typography } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { DefaultService } from '../generated';
import { usePermissions } from './PermissionContext';

export default function TransportPanel({
  projectId,
  instanceId,
  compact = false,
  isDisabled = false,
}: {
  projectId: string;
  instanceId: string;
  compact?: boolean;
  isDisabled?: boolean;
}) {
  const client = useQueryClient();
  const { canWrite } = usePermissions();
  const args = { projectId, instanceId };
  const state = useQuery({
    queryKey: ['connection', projectId, instanceId],
    queryFn: () => DefaultService.getConnection(args),
    refetchInterval: 5000,
    retry: false,
  });
  const change = useMutation({
    mutationKey: ['connection-change', projectId, instanceId],
    mutationFn: async (action: 'start' | 'stop') => {
      if (action === 'start') {
        return DefaultService.startConnection(args);
      }
      if (action === 'stop') {
        return DefaultService.stopConnection(args);
      }
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['connection', projectId] });
    },
  });
  if (!state.data) {
    return null;
  }
  const labels: Record<string, string> = {
    IDLE: '연결 대기',
    CONNECTING: '연결 시도 중',
    CONNECTED: '연결됨',
    CLOSED: '연결 종료',
    FAILED: '연결 실패',
  };
  const reasons: Record<string, string> = {
    AUTH_ERROR: 'Collector 인증 토큰이 일치하지 않습니다.',
    AGENT_TIMEOUT: 'Collector 시작 API의 응답 제한 시간을 초과했습니다.',
    CONNECTION_ERROR: 'Collector 시작 API에 접속하지 못했습니다.',
    TLS_ERROR: 'Collector HTTPS 인증서 검증에 실패했습니다.',
    DNS_ERROR: 'Collector 주소를 찾지 못했습니다.',
    AGENT_HTTP_ERROR: 'Collector 시작 API에서 오류 응답을 받았습니다.',
    ADDRESS_NOT_ALLOWED: 'Collector 주소가 중앙 접속 허용 목록에 없습니다.',
    NO_CONNECTION_RECEIVED:
      '시작 요청 후 연결이 도착하지 않았습니다. 대상의 Agent URL·인증서·아웃바운드·프록시를 확인해 주세요.',
    CONNECTION_CLOSED:
      '소켓 연결이 종료됐습니다. 자동 재시도하지 않으므로 연결 시작으로 재개해 주세요.',
  };
  const connected = ['CONNECTED', 'CONNECTING'].includes(state.data.state);
  return (
    <Card
      role="region"
      aria-label="Collector 연결 상태"
      size={compact ? 'small' : 'medium'}
      title={compact ? undefined : state.data.mode === 'WSS' ? '웹소켓 수집' : 'HTTP 수집'}
    >
      <Space wrap>
        <span role="status">
          <Tag color={state.data.state === 'CONNECTED' ? 'green' : 'default'}>
            {state.data.mode === 'WSS'
              ? (labels[state.data.state] ?? state.data.state)
              : 'HTTP 조회'}
          </Tag>
        </span>
        {state.data.mode === 'WSS' && canWrite && (
          <Button
            type={connected ? 'default' : 'primary'}
            loading={change.isPending}
            disabled={isDisabled || change.isPending}
            onClick={() => change.mutate(connected ? 'stop' : 'start')}
          >
            {connected ? '연결 종료' : '연결 시작'}
          </Button>
        )}
        {!compact && (
          <Link to={'/settings/instances?' + new URLSearchParams({ project: projectId })}>
            인스턴스 설정 →
          </Link>
        )}
      </Space>
      {state.data.mode === 'WSS' && (
        <Typography.Paragraph type="secondary">
          연결이 끊어지면 연결 시작으로 다시 연결하세요.
        </Typography.Paragraph>
      )}
      {(state.data.dropped ?? 0) > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`전송 대기열 초과로 제외된 요청: ${state.data.dropped}건`}
        />
      )}
      {state.data.reason && reasons[state.data.reason] && (
        <Alert type="warning" showIcon message={reasons[state.data.reason]} />
      )}
      {change.isError && (
        <Alert
          type="error"
          showIcon
          message="연결 요청에 실패했습니다. Collector 설정과 접속 가능 여부를 확인하세요."
        />
      )}
    </Card>
  );
}
