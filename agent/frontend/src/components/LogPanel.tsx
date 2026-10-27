// 로그 경로·주기 설정 및 화면 조회 중 증분 로그 표시
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getLogs, readLog, saveLog, type LogSource, type LogWrite } from '../api';
import { usePermissions } from './PermissionContext';
import { ProDescriptions, ProForm, ProTable, type ProColumns } from '@ant-design/pro-components';
import { Alert, Button, Checkbox, Flex, Form, Input, Modal, Select, Space } from 'antd';
import { Empty, Failure, Loading } from './QueryState';

const messages: Record<string, string> = {
  LOG_DISABLED: '미사용으로 설정된 로그입니다.',
  LOG_ROOTS_NOT_CONFIGURED:
    'Collector 설정의 monitor.log.allowed-roots에 로그 허용 폴더를 설정해야 합니다.',
  LOG_PATH_NOT_ALLOWED: '이 경로는 Collector의 로그 허용 폴더에 포함되지 않습니다.',
  LOG_FILE_UNAVAILABLE:
    '로그 파일이 없거나 WAS 계정으로 읽을 수 없습니다. 경로와 파일 권한을 확인하세요.',
  LOG_FILE_NOT_FOUND: '대상 로그 파일이 없습니다. 경로와 파일명에 포함된 날짜를 확인하세요.',
  LOG_ACCESS_DENIED: 'WAS 계정에 로그 파일 읽기 권한이 없습니다.',
  LOG_NOT_REGULAR_FILE: '폴더가 아닌 로그 파일 경로를 입력하세요.',
  LOG_READER_BUSY: '다른 로그 요청을 처리 중입니다. 잠시 후 다시 시작하세요.',
  LOG_VIEW_LIMIT: '동시에 열 수 있는 로그 수를 초과했습니다. 잠시 후 다시 시작하세요.',
  AUTH_ERROR: 'Collector 토큰을 확인하세요.',
  AGENT_TIMEOUT: 'Collector 응답 시간이 초과되어 조회를 멈췄습니다.',
  AGENT_HTTP_ERROR:
    'Collector HTTP 요청이 실패했습니다. 로그 기능이 포함된 JAR 반영 여부와 서버 접근 정책을 확인하세요.',
  ADDRESS_NOT_ALLOWED: '대시보드의 서버 접속 허용 목록을 확인하세요.',
  ALLOWLIST_CONFIG_ERROR: '대시보드에서 서버 접속 허용 목록 파일을 읽지 못했습니다.',
  CONNECTION_ERROR: '대상 서버에 연결하지 못했습니다. 서버 주소와 네트워크 상태를 확인하세요.',
  DNS_ERROR: '대상 서버 주소의 IP를 찾지 못했습니다. 서버 주소를 확인하세요.',
  TLS_ERROR: '대상 서버의 HTTPS 인증서를 검증하지 못했습니다.',
  REDIRECT_REJECTED:
    '대상 서버가 다른 주소로 이동을 요청했습니다. Collector Base URL을 확인하세요.',
  IDENTITY_MISMATCH: '등록한 프로젝트·인스턴스와 Collector 설정이 다릅니다.',
  LOG_RESPONSE_INVALID:
    'Collector의 로그 응답 형식이 올바르지 않습니다. 새 JAR 반영 여부를 확인하세요.',
  INVALID_LOG_REQUEST: '대상 서버의 로그 절대 경로와 파일 인코딩을 확인하세요.',
  INVALID_LOG_CURSOR: '이전 로그 위치를 확인하지 못했습니다. 로그 화면을 다시 열어주세요.',
  FORBIDDEN: '로그를 조회할 권한이 없습니다.',
};

export function appendLogText(previous: string, next: string, reset: boolean) {
  const text = (reset ? next : previous + next).slice(-131072);
  const lines = text.split('\n');
  return lines.length > 2000 ? lines.slice(-2000).join('\n') : text;
}

export default function LogPanel({
  projectId,
  instanceId,
}: {
  projectId: string;
  instanceId: string;
}) {
  const permissions = usePermissions();
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ['logs', projectId, instanceId],
    queryFn: () => getLogs(projectId, instanceId),
    retry: false,
    refetchInterval: 30_000,
  });
  const [selected, setSelected] = useState<number>();
  const [editing, setEditing] = useState<LogSource | 'new'>();
  const source = query.data?.find((log) => log.log_id === selected);
  const columns: ProColumns<LogSource>[] = [
    {
      title: '로그 이름',
      dataIndex: 'name',
      render: (_, log) => (
        <Button
          type={selected === log.log_id ? 'primary' : 'default'}
          disabled={!log.enabled}
          onClick={() => setSelected(log.log_id)}
        >
          {log.name}
        </Button>
      ),
    },
    { title: '파일 경로', dataIndex: 'path', render: (_, log) => <code>{log.path}</code> },
    {
      title: '대상 상태',
      dataIndex: 'enabled',
      renderText: (enabled) => (enabled ? '사용' : '미사용'),
    },
    {
      title: '작업',
      valueType: 'option',
      render: (_, log) => (
        <Button type="link" onClick={() => setEditing(log)}>
          설정
        </Button>
      ),
    },
  ];
  if (!permissions.canWrite) {
    return <Alert type="info" title="로그 조회는 관리자와 담당 운영자에게만 허용됩니다." />;
  }
  if (query.isPending) {
    return <Loading />;
  }
  if (query.isError && !query.data) {
    return <Failure />;
  }
  return (
    <div className="log-panel">
      <div className="log-source-heading">
        <h2>서버 로그</h2>
        <Button type="primary" onClick={() => setEditing('new')}>
          로그 등록
        </Button>
      </div>
      {!query.data?.length ? (
        <Empty />
      ) : (
        <ProTable<LogSource>
          aria-label="로그 소스 목록"
          rowKey="log_id"
          columns={columns}
          dataSource={query.data}
          search={false}
          options={false}
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
      )}
      {source && (
        <LogViewer
          key={`${projectId}/${instanceId}/${source.log_id}`}
          projectId={projectId}
          instanceId={instanceId}
          source={source}
        />
      )}
      {editing && (
        <LogSettings
          projectId={projectId}
          instanceId={instanceId}
          source={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            void cache.invalidateQueries({ queryKey: ['logs', projectId, instanceId] });
          }}
        />
      )}
    </div>
  );
}

function LogViewer({
  projectId,
  instanceId,
  source,
}: {
  projectId: string;
  instanceId: string;
  source: LogSource;
}) {
  const [playing, setPlaying] = useState(false);
  const [visible, setVisible] = useState(document.visibilityState !== 'hidden');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [retryAt, setRetryAt] = useState(0);
  const [lastRead, setLastRead] = useState<number>();
  const [lastChange, setLastChange] = useState<number>();
  const [newCharacters, setNewCharacters] = useState(0);
  const cursor = useRef<string | undefined>(undefined);
  const output = useRef<HTMLPreElement>(null);
  const config = `${source.path}/${source.encoding}`;
  useEffect(() => {
    cursor.current = undefined;
    setText('');
    setPlaying(false);
    setError('');
    setNotice('');
    setRetryAt(0);
    setLastRead(undefined);
    setLastChange(undefined);
    setNewCharacters(0);
  }, [config]);
  useEffect(() => {
    if (!source.enabled) {
      setPlaying(false);
      setText('');
      cursor.current = undefined;
    }
  }, [source.enabled]);
  useEffect(() => {
    const visibility = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  useEffect(() => {
    if (!playing || !visible || !source.enabled) {
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: ReturnType<typeof readLog> | undefined;
    async function poll() {
      setBusy(true);
      try {
        pending = readLog(projectId, instanceId, source.log_id, cursor.current);
        const result = await pending;
        if (stopped) {
          return;
        }
        if (result.code) {
          setError(messages[result.code] ?? `로그를 읽지 못했습니다 (${result.code}).`);
          setRetryAt(Date.now() + result.retry_after_seconds * 1000);
          setPlaying(false);
          return;
        }
        const hadCursor = cursor.current !== undefined;
        const readAt = Date.now();
        setLastRead(readAt);
        setNewCharacters(result.text.length);
        if (result.text.length > 0) {
          setLastChange(readAt);
        }
        setError('');
        cursor.current = result.cursor;
        setText((previous) => appendLogText(previous, result.text, result.reset));
        if (result.reset && hadCursor) {
          setNotice('로그 파일이 교체되었거나 이전 위치가 만료되어 최근 내용부터 표시합니다.');
        } else if (result.limited) {
          setNotice(
            '표시 범위를 초과한 내용은 생략됩니다. 이어지는 내용은 다음 조회에서 가져옵니다.',
          );
        }
        timer = setTimeout(
          () => {
            void poll();
          },
          Math.max(source.poll_interval_seconds, result.retry_after_seconds) * 1000,
        );
      } catch (failure) {
        if (!stopped) {
          const status = (failure as { status?: number }).status;
          setError(
            status === 403
              ? messages.FORBIDDEN
              : '로그 요청이 실패해 조회를 멈췄습니다. 서버 연결 상태를 확인하세요.',
          );
          setRetryAt(Date.now() + 60_000);
          setPlaying(false);
        }
      } finally {
        if (!stopped) {
          setBusy(false);
        }
      }
    }
    const delay = Math.max(0, retryAt - Date.now());
    timer = setTimeout(() => {
      void poll();
    }, delay);
    return () => {
      stopped = true;
      clearTimeout(timer);
      pending?.cancel();
      setBusy(false);
    };
    // 조회 사이에 커서와 제한된 출력을 유지하고 설정 변경 시 조회 흐름 재시작
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    playing,
    visible,
    source.enabled,
    source.poll_interval_seconds,
    config,
    projectId,
    instanceId,
    source.log_id,
    retryAt,
  ]);
  useEffect(() => {
    if (autoScroll && output.current) {
      output.current.scrollTop = output.current.scrollHeight;
    }
  }, [text, autoScroll]);
  return (
    <section className="log-viewer" aria-label={`${source.name} 로그`}>
      <ProDescriptions
        column={1}
        bordered
        dataSource={{
          path: source.path,
          encoding: source.encoding,
          interval: `${source.poll_interval_seconds}초`,
        }}
        columns={[
          { title: '서버 로그 경로', dataIndex: 'path' },
          { title: '인코딩', dataIndex: 'encoding' },
          { title: '조회 주기', dataIndex: 'interval' },
        ]}
      />
      <div className="log-toolbar">
        <h3>{source.name}</h3>
        <Checkbox checked={autoScroll} onChange={(event) => setAutoScroll(event.target.checked)}>
          자동 스크롤
        </Checkbox>
        <Button disabled={!source.enabled} onClick={() => setPlaying((value) => !value)}>
          {playing ? '일시정지' : '조회 시작'}
        </Button>
        <span aria-live="polite">
          {!source.enabled
            ? '미사용'
            : !visible
              ? '화면 숨김 · 조회 중지'
              : playing
                ? busy
                  ? '읽는 중'
                  : '조회 중'
                : '조회 중지'}
        </span>
      </div>
      <div className="log-read-status" role="status">
        {lastRead ? (
          <>
            마지막 조회 {new Date(lastRead).toLocaleTimeString()} ·{' '}
            {newCharacters ? `추가된 내용 ${newCharacters.toLocaleString()}자` : '새 로그 없음'}
            {lastChange && <> · 마지막 내용 수신 {new Date(lastChange).toLocaleTimeString()}</>}
          </>
        ) : (
          '조회 시작을 누르면 새로 추가되는 내용을 가져옵니다.'
        )}
      </div>
      {error && <Alert type="error" title={error} />}
      {notice && <Alert type="info" title={notice} />}
      <pre ref={output} className="log-output" tabIndex={0} aria-label="로그 원문">
        {text || (busy ? '로그를 읽고 있습니다.' : '표시할 로그가 없습니다.')}
      </pre>
    </section>
  );
}

function LogSettings({
  projectId,
  instanceId,
  source,
  onClose,
  onSaved,
}: {
  projectId: string;
  instanceId: string;
  source?: LogSource;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState<LogWrite>({
    name: source?.name ?? '',
    path: source?.path ?? '',
    encoding: (source?.encoding ?? 'UTF-8') as LogWrite['encoding'],
    enabled: source?.enabled ?? false,
    pollIntervalSeconds: source?.poll_interval_seconds ?? 10,
  });
  const mutation = useMutation({
    mutationFn: () => saveLog(projectId, instanceId, value, source?.log_id),
    onSuccess: onSaved,
  });
  const valid =
    !!value.name.trim() &&
    !!value.path.trim() &&
    Number.isInteger(value.pollIntervalSeconds) &&
    value.pollIntervalSeconds >= 5 &&
    value.pollIntervalSeconds <= 1800;
  return (
    <Modal
      open
      title={source ? '로그 설정' : '로그 등록'}
      onCancel={onClose}
      closable={false}
      mask={{ closable: false }}
      footer={null}
    >
      <ProForm
        id="log-settings-form"
        layout="vertical"
        submitter={false}
        onFinish={async () => {
          if (valid) mutation.mutate();
          return false;
        }}
      >
        <Form.Item label="로그 이름" htmlFor="log-name">
          <Input
            id="log-name"
            placeholder="예: 애플리케이션 로그"
            value={value.name}
            maxLength={120}
            required
            onChange={(event) => setValue((current) => ({ ...current, name: event.target.value }))}
          />
        </Form.Item>
        <Form.Item
          label="파일 경로"
          htmlFor="log-path"
          extra="Collector에서 허용한 폴더의 절대 경로만 조회합니다."
        >
          <Input
            id="log-path"
            value={value.path}
            maxLength={1000}
            required
            placeholder="예: /logs/catalina.{yyyy-MM-dd}.log"
            onChange={(event) => setValue((current) => ({ ...current, path: event.target.value }))}
          />
        </Form.Item>
        <Form.Item label="파일 인코딩" htmlFor="log-encoding">
          <Select
            id="log-encoding"
            value={value.encoding}
            onChange={(encoding) =>
              setValue((current) => ({ ...current, encoding: encoding as LogWrite['encoding'] }))
            }
            options={['UTF-8', 'MS949', 'EUC-KR'].map((encoding) => ({
              value: encoding,
              label: encoding,
            }))}
          />
        </Form.Item>
        <Form.Item
          label="로그 조회"
          htmlFor="log-enabled"
          extra="미사용이면 수동·자동 조회 모두 중지합니다. 사용해도 로그 화면을 열었을 때만 요청합니다."
        >
          <Select
            id="log-enabled"
            value={value.enabled}
            onChange={(enabled) => setValue((current) => ({ ...current, enabled }))}
            options={[
              { value: true, label: '사용' },
              { value: false, label: '미사용' },
            ]}
          />
        </Form.Item>
        <Form.Item label="조회 주기(초)" htmlFor="log-interval">
          <Input
            id="log-interval"
            placeholder="5~1,800초"
            type="number"
            min={5}
            max={1800}
            value={value.pollIntervalSeconds}
            onChange={(event) =>
              setValue((current) => ({
                ...current,
                pollIntervalSeconds: Number(event.target.value),
              }))
            }
          />
        </Form.Item>
        {mutation.isError && <Alert type="error" title="로그 설정을 저장하지 못했습니다." />}
        <Flex justify="end" gap="small" wrap>
          <Button onClick={onClose}>취소</Button>
          <Button type="primary" htmlType="submit" loading={mutation.isPending} disabled={!valid}>
            저장
          </Button>
        </Flex>
      </ProForm>
    </Modal>
  );
}
