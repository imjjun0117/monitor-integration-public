// 사용자 접근 및 설정 변경 이력 조회 화면
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, FormSelect, FormSelectOption, TextInput } from '../../components/ui';
import { Table, Tbody, Td, Th, Thead, Tr } from '../../components/ui';
import { getAudit, getProjects } from '../../api';
import { Empty, Failure, Loading, RefreshFailure } from '../../components/QueryState';
import { roleLabels } from '../../components/PermissionContext';
import { LabeledField } from './forms';

const entities: Record<string, string> = {
  projects: '프로젝트',
  instances: '인스턴스',
  check_definitions: '점검 설정',
  thresholds: '임계치',
  certificate_targets: '인증서 대상',
  app_users: '계정',
  user_project_access: '프로젝트 권한',
  log_sources: '로그 설정',
  LOG_VIEW: '서버 로그',
  REQUEST: '요청 처리',
};
const actions: Record<string, string> = {
  INSERT: '등록',
  UPDATE: '수정',
  DELETE: '삭제',
  POST: '실행·등록 요청',
  PUT: '변경 요청',
  READ: '조회',
};
const outcomes: Record<string, string> = {
  SUCCESS: '완료',
  ACCEPTED: '접수',
  FAILED: '실패',
  DENIED: '권한 없음',
};
const fields: Record<string, string> = {
  project_id: '프로젝트',
  instance_id: '인스턴스',
  check_id: '점검',
  username: '계정',
  role: '역할',
  enabled: '사용',
  display_name: '표시명',
  monitoring_enabled: '점검 사용',
  automatic_enabled: '자동 실행',
  check_interval_seconds: '점검 주기(초)',
  poll_interval_seconds: '수집 주기(초)',
  warning_value: '경고 기준',
  critical_value: '위험 기준',
  password_changed: '비밀번호 변경',
  token_changed: '토큰 변경',
  service_profile_changed: '서비스 설정 변경',
  environment: '환경',
  agent_base_url: '에이전트 주소',
  api_checks_enabled: 'API 점검',
  hostname: '도메인',
  sni_hostname: '인증 도메인',
  port: '포트',
  check_interval_minutes: '점검 주기(분)',
  scope: '적용 범위',
  metric_key: '지표',
  name: '이름',
  category: '종류',
  direction: '점검 구분',
  certificate_target_id: '인증서 대상 ID',
};
function valueText(value: unknown) {
  return value == null
    ? '없음'
    : typeof value === 'boolean'
      ? value
        ? '예'
        : '아니오'
      : typeof value === 'string'
        ? (roleLabels[value] ?? value)
        : JSON.stringify(value);
}
export default function AuditSettingsTab() {
  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState({ project: '', actor: '' });
  const [filters, setFilters] = useState(draft);
  const query = useQuery({
    queryKey: ['audit', page, filters],
    queryFn: () => getAudit(page, filters.project, filters.actor),
    refetchInterval: 15_000,
  });
  const projects = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  return (
    <>
      <form
        className="filters"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(0);
          setFilters({ ...draft });
        }}
      >
        <LabeledField id="audit-project" label="프로젝트">
          <FormSelect
            id="audit-project"
            value={draft.project}
            onChange={(_, project) => setDraft({ ...draft, project })}
          >
            <FormSelectOption value="" label="전체 프로젝트" />
            {projects.data?.items.map((project) => (
              <FormSelectOption
                key={project.project_id}
                value={project.project_id}
                label={project.display_name}
              />
            ))}
          </FormSelect>
        </LabeledField>
        <LabeledField id="audit-actor" label="변경자">
          <TextInput
            id="audit-actor"
            value={draft.actor}
            placeholder="계정 ID"
            onChange={(_, actor) => setDraft({ ...draft, actor })}
          />
        </LabeledField>
        <Button type="submit" variant="secondary">
          검색
        </Button>
      </form>
      <RefreshFailure
        visible={query.isError && Boolean(query.data)}
        updatedAt={query.dataUpdatedAt}
        retry={() => void query.refetch()}
      />
      {query.isPending ? (
        <Loading />
      ) : query.isError && !query.data ? (
        <Failure />
      ) : !query.data?.items.length ? (
        <Empty>변경 이력이 없습니다.</Empty>
      ) : (
        <>
          <Table aria-label="변경 이력">
            <Thead>
              <Tr>
                <Th>시각</Th>
                <Th>변경자</Th>
                <Th>항목</Th>
                <Th>대상</Th>
                <Th>작업</Th>
                <Th>결과·변경 내용</Th>
              </Tr>
            </Thead>
            <Tbody>
              {query.data.items.map((entry) => {
                const before = entry.before_values ?? {},
                  after = entry.after_values ?? {};
                const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
                  (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
                );
                return (
                  <Tr key={entry.audit_id}>
                    <Td>{new Date(entry.occurred_at).toLocaleString('ko-KR')}</Td>
                    <Td>{entry.actor}</Td>
                    <Td>{entities[entry.entity_type] ?? entry.entity_type}</Td>
                    <Td>{entry.target_id}</Td>
                    <Td>{actions[entry.action] ?? entry.action}</Td>
                    <Td>
                      {outcomes[entry.outcome] ?? entry.outcome}
                      {keys.length > 0 && (
                        <details className="audit-diff">
                          <summary>변경 내용 {keys.length}건</summary>
                          <dl>
                            {keys.map((key) => (
                              <div key={key}>
                                <dt>{fields[key] ?? key}</dt>
                                <dd>
                                  {valueText(before[key])} → {valueText(after[key])}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </details>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
          <div className="project-overview-pagination">
            <span>전체 {query.data.total}건</span>
            <Button
              variant="secondary"
              size="sm"
              isDisabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              이전
            </Button>
            <span>{page + 1}</span>
            <Button
              variant="secondary"
              size="sm"
              isDisabled={(page + 1) * 50 >= query.data.total}
              onClick={() => setPage(page + 1)}
            >
              다음
            </Button>
          </div>
        </>
      )}
    </>
  );
}
