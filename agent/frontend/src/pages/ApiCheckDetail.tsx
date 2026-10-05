// API 요청·응답 증적 및 최근 결과 표시
import { Alert, Button, Modal, ModalBody, ModalHeader } from '../components/ui';
import type { ApiCheck } from '../api';
import MetricChart from '../components/MetricChart';
import StatusLabel from '../components/StatusLabel';
import ServiceInfoCard from '../components/ServiceInfoCard';
import ServiceSettingsButton from '../components/ServiceSettingsButton';

import { checkName, checkOutcome } from '../utils/checkPresentation';
export { checkName, checkOutcome };

const descriptions: Record<string, string> = {
  nice: 'NICE 사이트의 응답을 확인합니다. 실제 본인인증 절차가 성공하는지는 이 점검으로 확인할 수 없습니다.',
  smart:
    'SMART5는 특허 등급 평가 서비스입니다. 이 항목은 사이트 연결만 확인하며, 평가 요청을 생성하지 않습니다.',
  'smart5-grade':
    'SMART5에서 지정한 특허의 기존 등급 조회 응답을 확인합니다. 새 평가를 신청하지 않습니다.',
  'smartv-report':
    'SMART V는 특허 가치 평가 보고서 서비스입니다. 이미 발급된 평가번호로 보고서 상태와 상세 응답을 조회합니다.',
  popbill:
    '연동회원·파트너 잔액과 알림톡·SMS·LMS의 실제 과금 대상을 조회합니다. 예상 발송 건수는 유형별 과금 잔액으로 계산하며, 충전 이력은 연동회원 내역만 제공합니다. 실제 메시지는 발송하지 않습니다.',
  'catalog-api':
    '목록 API에 오늘 날짜로 조회하고, 응답에 transferCount가 포함돼 있는지 확인합니다.',
  odcloud: '공공데이터포털 사업자 상태 API를 호출하고, 응답의 status_code가 OK인지 확인합니다.',
  'document-viewer': '문서 뷰어 서버가 응답하는지 확인합니다. 문서 변환 작업은 실행하지 않습니다.',
  'sms-seesaw':
    '시소톡 SMS 서버의 HTTPS 응답만 확인합니다. 계정 인증·문자 발송·잔액 조회를 확인하는 점검은 아닙니다. 잔액 조회 API 규격이 확인되기 전에는 잔액을 표시하지 않습니다.',
  'push-fcm':
    '샘플 앱에서 사용하는 FCM API 주소의 GET 응답을 확인합니다. 실제 푸시를 발송하지 않으며 계정 인증·POST 발송·앱 수신 성공은 확인하지 않습니다. 404 응답이면 기존 연동 주소를 확인해야 합니다.',
  'sns-facebook':
    '기존 DB에 저장된 페이지 ID와 인증값으로 최근 Facebook 게시물 1개를 읽습니다. 게시물이 없어도 올바른 목록 응답이면 정상이며, 게시물을 등록하거나 DB 수집 배치를 실행하지 않습니다.',
  'sns-instagram':
    '기존 DB의 인증값으로 현재 홈페이지에서 사용하는 Instagram 미디어 API를 조회합니다. 인증·권한·API 버전 오류는 받은 응답에서 확인할 수 있으며, 게시물을 등록하지 않습니다.',
  'sns-youtube':
    '기존 DB의 채널 ID와 API 키로 YouTube 채널 정보와 영상·구독자·조회수를 읽습니다. 비공개 구독자 수와 남은 API 할당량은 확인되지 않은 값으로 유지합니다.',
};

export default function ApiCheckDetail({
  check,
  close,
  run,
  running,
  waiting,
  timedOut,
}: {
  check: ApiCheck;
  close: () => void;
  run: () => void;
  running: boolean;
  waiting: boolean;
  timedOut: boolean;
}) {
  const http = check.http;
  const history = (check.history ?? []).filter((point) => point.duration_ms != null);
  const name = checkName(check);
  return (
    <Modal
      variant="drawer"
      isOpen
      aria-label="API 점검 상세"
      closeLabel="상세 닫기"
      onClose={close}
    >
      <ModalHeader title={name} />
      <ModalBody>
        <p className="api-purpose">
          {check.service_profile?.description ||
            descriptions[check.check_id] ||
            '설정한 요청의 응답과 정상 판정 기준을 확인합니다.'}
        </p>
        {check.monitoring_enabled === false && (
          <Alert variant="info" title="미사용 API · 점검 중지">
            자동·수동 점검과 장애 집계에서 제외되어 있습니다. 아래 내용은 마지막 점검 기록이며,
            목록에서 사용으로 전환할 수 있습니다.
          </Alert>
        )}
        <div className="api-execution-summary">
          {check.monitoring_enabled === false && <span>마지막 점검 결과</span>}
          <StatusLabel status={check.status} />
          <span>
            {check.checked_at
              ? new Date(check.checked_at).toLocaleString('ko-KR')
              : '실행 기록 없음'}
          </span>
        </div>
        <p className="api-outcome">{checkOutcome(check)}</p>
        <dl>
          <dt>실행 서버</dt>
          <dd>{check.instance_name ?? check.instance_id}</dd>
          <dt>걸린 시간</dt>
          <dd>
            {check.duration_ms == null
              ? '미수집'
              : `${check.duration_ms.toLocaleString('ko-KR')} ms (${(check.duration_ms / 1000).toFixed(3)}초)`}
          </dd>
          <dt>결과 코드</dt>
          <dd>
            <code>{check.result_code || check.message || '미수집'}</code>
          </dd>
        </dl>
        <div className="api-run-action">
          <Button
            permission="write"
            isLoading={running}
            isDisabled={waiting || check.monitoring_enabled === false}
            onClick={run}
          >
            지금 테스트 실행
          </Button>
          <ServiceSettingsButton check={check} />
          <p>이 서버에서 같은 요청을 한 번 더 보내고, 아래 결과를 새로 갱신합니다.</p>
        </div>
        {waiting && <Alert variant="info" title="테스트 결과를 기다리고 있습니다." />}
        {timedOut && (
          <Alert
            variant="warning"
            title="아직 새 결과가 도착하지 않았습니다. 결과는 수집되는 대로 표시됩니다."
          />
        )}
        <ServiceInfoCard check={check} showServer={false} />
        {check.details && (
          <BodyBlock title="SDK 조회 결과" body={JSON.stringify(check.details)} empty="미수집" />
        )}
        {http ? (
          <>
            <section className="api-evidence-section">
              <h3>보낸 요청</h3>
              <dl>
                <dt>요청 방식</dt>
                <dd>{http.method ?? '미수집'}</dd>
                <dt>요청 주소</dt>
                <dd>
                  <code>{http.url ?? '주소 설정 확인 필요'}</code>
                </dd>
                <dt>제한 시간</dt>
                <dd>
                  연결 {(http.connect_timeout_ms ?? 0) / 1000}초 · 응답{' '}
                  {(http.read_timeout_ms ?? 0) / 1000}초
                </dd>
                <dt>정상 판정 기준</dt>
                <dd>{http.expected ?? '미수집'}</dd>
              </dl>
              <JsonBlock title="주소에 붙인 입력값" value={http.request_query} />
              <JsonBlock title="요청 헤더" value={http.request_headers} />
              <BodyBlock
                title="요청 본문"
                body={http.request_body}
                truncated={http.request_body_truncated}
                empty="요청 본문 없음"
              />
            </section>
            <section className="api-evidence-section">
              <h3>받은 응답</h3>
              <dl>
                <dt>HTTP 응답 코드</dt>
                <dd>
                  {http.status_code == null ? '응답 코드를 받지 못함' : `HTTP ${http.status_code}`}
                </dd>
                <dt>본문 크기</dt>
                <dd>
                  {http.response_bytes == null
                    ? '미수집'
                    : `${http.response_bytes.toLocaleString('ko-KR')} bytes`}
                </dd>
              </dl>
              <JsonBlock title="응답 헤더" value={http.response_headers} />
              <BodyBlock
                title="응답 본문"
                body={http.response_body}
                truncated={http.response_body_truncated}
                empty={
                  http.status_code == null
                    ? '수신한 응답 본문이 없습니다.'
                    : '응답 본문이 비어 있거나 수신을 완료하지 못했습니다.'
                }
              />
            </section>
            <p className="api-detail-note">
              인증 정보와 개인정보는 가립니다. 본문은 최대 4,096자까지 표시하며, HTML도 코드로
              표시합니다.
            </p>
          </>
        ) : (
          !check.details && (
            <Alert variant="info" title="이 실행에는 요청·응답 상세가 수집되지 않았습니다.">
              상세 수집 기능이 반영된 Collector에서 테스트를 실행하면 실제 요청과 응답이 표시됩니다.
            </Alert>
          )
        )}
        {history.length >= 2 ? (
          <MetricChart
            title="점검에 걸린 시간 · 최근 24시간"
            points={history}
            xKey="checked_at"
            yKey="duration_ms"
            unit="ms"
            summary={
              <p className="api-chart-help">
                가로: 테스트 실행 시각 · 세로: 요청부터 응답 확인까지 걸린 시간. 1,000 ms = 1초이며
                낮을수록 빠릅니다. 선은 각 점검 결과를 연결한 것으로, 실시간 연속 측정값은 아닙니다.
              </p>
            }
          />
        ) : (
          <p className="api-detail-note">
            시간 비교 차트는 점검 기록이 2개 이상 쌓이면 표시됩니다.
          </p>
        )}
      </ModalBody>
    </Modal>
  );
}

function JsonBlock({ title, value }: { title: string; value?: Record<string, string> }) {
  if (!value || Object.keys(value).length === 0) {
    return null;
  }
  return (
    <div className="api-code-block">
      <h4>{title}</h4>
      <pre tabIndex={0} aria-label={title}>
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function BodyBlock({
  title,
  body,
  truncated,
  empty,
}: {
  title: string;
  body?: string | null;
  truncated?: boolean;
  empty: string;
}) {
  let display = body;
  try {
    if (body) {
      display = JSON.stringify(JSON.parse(body), null, 2);
    }
  } catch {
    /* JSON이 아니면 HTML로 실행하지 않고 원문 표시 */
  }
  return (
    <div className="api-code-block">
      <h4>
        {title}
        {truncated && <span> · 일부만 표시</span>}
      </h4>
      {body ? (
        <pre tabIndex={0} aria-label={title}>
          {display}
        </pre>
      ) : (
        <p className="api-detail-note">{empty}</p>
      )}
    </div>
  );
}
