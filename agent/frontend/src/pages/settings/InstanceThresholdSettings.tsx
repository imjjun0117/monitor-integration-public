// 선택한 서버에 등록한 임계치와 항목별 알림 이메일 관리
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getInstanceThresholds,
  saveInstanceThresholds,
  getInstanceThresholdCertificates,
} from '../../api';
import { usePermissions } from '../../components/PermissionContext';
import { Failure, Loading } from '../../components/QueryState';
import { Alert as AntAlert, Button as AntButton, Input, Select, Space } from 'antd';
import { ProTable, type ProColumns } from '@ant-design/pro-components';
import type {
  InstanceThresholdMetric as Metric,
  InstanceThresholdMetricKey as MetricKey,
} from '../../generated';
import { LabeledField, SettingsDialog } from './forms';

const descriptions: Record<
  MetricKey,
  { name: string; unit: string; factor: number; help: string }
> = {
  CERTIFICATE_DAYS: {
    name: 'SSL 인증서 만료',
    unit: '일',
    factor: 1,
    help: '남은 일수가 기준 이하이면 경고·위험으로 표시',
  },
  SYSTEM_CPU: { name: 'CPU 사용률', unit: '%', factor: 100, help: '서버 전체 CPU 사용률' },
  PHYSICAL_MEMORY: {
    name: 'RAM 사용률',
    unit: '%',
    factor: 100,
    help: '서버 전체 RAM에서 사용 중인 비율',
  },
  JVM_HEAP: {
    name: 'JVM Heap 사용률',
    unit: '%',
    factor: 100,
    help: 'JVM 최대 Heap에서 사용 중인 비율',
  },
  DISK: { name: '디스크 사용률', unit: '%', factor: 100, help: '등록된 디스크에 각각 적용' },
  DB_POOL: {
    name: 'DB Pool 사용률',
    unit: '%',
    factor: 100,
    help: '최대 연결 수에서 사용 중인 비율',
  },
  API_LATENCY_MS: {
    name: 'API 응답시간',
    unit: '초',
    factor: 0.001,
    help: '응답시간이 기준 이상이면 경고·위험으로 표시',
  },
};

type Draft = {
  originalKey?: MetricKey;
  certificateTargetId?: number | null;
  metricKey: MetricKey | '';
  warning: string;
  critical: string;
  emails: string;
};
function emails(text: string) {
  return [
    ...new Set(
      text
        .split(/[,;\n]+/)
        .map((email) => email.trim())
        .filter(Boolean),
    ),
  ];
}
function validEmails(values: string[]) {
  const pattern =
    /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
  return values.length <= 10 && values.every((email) => email.length <= 254 && pattern.test(email));
}
function displayed(value: number, key: MetricKey) {
  return Number((value * descriptions[key].factor).toFixed(6));
}
function writeOf(metric: Metric) {
  return {
    metricKey: metric.metricKey,
    warningValue: metric.warningValue,
    criticalValue: metric.criticalValue,
    useDefault: false,
    recipientEmails: metric.recipientEmails,
    ...(metric.certificateTargetId != null
      ? { certificateTargetId: metric.certificateTargetId }
      : {}),
  };
}

export default function InstanceThresholdSettings({
  projectId,
  instanceId,
}: {
  projectId: string;
  instanceId: string;
}) {
  const { canWrite } = usePermissions();
  const client = useQueryClient();
  const queryKey = ['instance-thresholds', projectId, instanceId];
  const query = useQuery({
    queryKey,
    queryFn: () => getInstanceThresholds(projectId, instanceId),
    retry: false,
  });
  const [draft, setDraft] = useState<Draft>();
  const [removing, setRemoving] = useState<Metric>();
  const [validation, setValidation] = useState<string>();
  const certificates = useQuery({
    queryKey: ['threshold-certificates', projectId, instanceId],
    queryFn: () => getInstanceThresholdCertificates(projectId, instanceId),
    enabled: draft?.metricKey === 'CERTIFICATE_DAYS',
    retry: false,
  });
  const save = useMutation({
    mutationFn: (value: Parameters<typeof saveInstanceThresholds>[2]) =>
      saveInstanceThresholds(projectId, instanceId, value),
    onSuccess: (saved) => {
      client.setQueryData(queryKey, saved);
      setDraft(undefined);
      setRemoving(undefined);
      setValidation(undefined);
      void client.invalidateQueries({ queryKey: ['thresholds'] });
      void client.invalidateQueries({ queryKey: ['dashboard'] });
      void client.invalidateQueries({ queryKey: ['certificates'] });
      void client.invalidateQueries({ queryKey: ['threshold-certificates'] });
    },
  });
  if (query.isPending) {
    return <Loading />;
  }
  if (query.isError) {
    return <Failure />;
  }
  const settings = query.data!;

  function openAdd() {
    setValidation(undefined);
    save.reset();
    setDraft({ metricKey: '', warning: '', critical: '', emails: '' });
  }
  function openEdit(metric: Metric) {
    setValidation(undefined);
    save.reset();
    setDraft({
      originalKey: metric.metricKey,
      certificateTargetId: metric.certificateTargetId,
      metricKey: metric.metricKey,
      warning: String(displayed(metric.warningValue, metric.metricKey)),
      critical: String(displayed(metric.criticalValue, metric.metricKey)),
      emails: metric.recipientEmails.join(', '),
    });
  }
  function register() {
    if (!draft?.metricKey) {
      setValidation('항목을 선택해 주세요.');
      return;
    }
    const { name, unit, factor } = descriptions[draft.metricKey];
    const certificate = draft.metricKey === 'CERTIFICATE_DAYS';
    const warningValue = Number(draft.warning) / factor;
    const criticalValue = Number(draft.critical) / factor;
    if (
      !draft.warning.trim() ||
      !draft.critical.trim() ||
      !Number.isFinite(warningValue) ||
      !Number.isFinite(criticalValue) ||
      warningValue < 0 ||
      criticalValue < 0 ||
      (certificate ? warningValue < criticalValue : warningValue > criticalValue) ||
      (certificate && (!Number.isInteger(warningValue) || !Number.isInteger(criticalValue))) ||
      (unit === '%' && criticalValue > 1)
    ) {
      setValidation(
        certificate
          ? 'SSL 인증서 만료: 일수는 0 이상의 정수이며 경고는 위험 이상으로 입력해 주세요. 예: 경고 30일, 위험 7일.'
          : `${name}: 경고는 위험 이하로 입력해 주세요.${unit === '%' ? ' 사용률은 0~100%입니다.' : ''}`,
      );
      return;
    }
    if (certificate && !draft.certificateTargetId) {
      setValidation('인증서 대상을 선택해 주세요.');
      return;
    }
    const recipients = emails(draft.emails);
    if (!validEmails(recipients)) {
      setValidation('알림 이메일을 확인해 주세요. 최대 10개까지 등록할 수 있습니다.');
      return;
    }
    const metrics = settings.metrics
      .filter((metric) => metric.metricKey !== draft.originalKey)
      .map(writeOf);
    if (metrics.some((metric) => metric.metricKey === draft.metricKey)) {
      setValidation('이미 등록한 항목입니다. 해당 항목을 수정해 주세요.');
      return;
    }
    save.mutate({
      recipientEmails: settings.recipientEmails,
      metrics: [
        ...metrics,
        {
          metricKey: draft.metricKey,
          warningValue,
          criticalValue,
          useDefault: false,
          recipientEmails: recipients,
          ...(certificate ? { certificateTargetId: draft.certificateTargetId } : {}),
        },
      ],
    });
  }
  const description = draft?.metricKey ? descriptions[draft.metricKey] : undefined;
  const columns: ProColumns<Metric>[] = [
    {
      title: '항목',
      render: (_, metric) => (
        <>
          {descriptions[metric.metricKey].name}
          {metric.metricKey === 'CERTIFICATE_DAYS' && (
            <span className="threshold-certificate-label">
              {metric.certificateTargetLabel ?? '인증서 대상 연결 필요'}
            </span>
          )}
        </>
      ),
    },
    {
      title: '경고',
      render: (_, metric) => (
        <>
          {displayed(metric.warningValue, metric.metricKey)}
          {descriptions[metric.metricKey].unit}{' '}
          {metric.metricKey === 'CERTIFICATE_DAYS' ? '이하' : '이상'}
        </>
      ),
    },
    {
      title: '위험',
      render: (_, metric) => (
        <>
          {displayed(metric.criticalValue, metric.metricKey)}
          {descriptions[metric.metricKey].unit}{' '}
          {metric.metricKey === 'CERTIFICATE_DAYS' ? '이하' : '이상'}
        </>
      ),
    },
    {
      title: '알림 이메일',
      render: (_, metric) =>
        metric.recipientEmails.length ? (
          <ul className="threshold-email-list">
            {metric.recipientEmails.map((email) => (
              <li key={email}>{email}</li>
            ))}
          </ul>
        ) : (
          '미설정'
        ),
    },
    {
      title: '작업',
      render: (_, metric) => (
        <Space>
          <AntButton
            aria-label={`${descriptions[metric.metricKey].name} 수정`}
            disabled={!canWrite || save.isPending}
            onClick={() => openEdit(metric)}
          >
            수정
          </AntButton>
          <AntButton
            danger
            aria-label={`${descriptions[metric.metricKey].name} 삭제`}
            disabled={!canWrite || save.isPending}
            onClick={() => {
              save.reset();
              setRemoving(metric);
            }}
          >
            삭제
          </AntButton>
        </Space>
      ),
    },
  ];
  return (
    <div className="instance-threshold-settings">
      <div className="settings-toolbar">
        <span>{settings.metrics.length}개 항목</span>
        <AntButton
          type="primary"
          disabled={
            !canWrite ||
            settings.metrics.length === Object.keys(descriptions).length ||
            save.isPending
          }
          onClick={openAdd}
        >
          추가
        </AntButton>
      </div>
      <ProTable<Metric>
        aria-label="등록된 임계치"
        rowKey="metricKey"
        columns={columns}
        dataSource={settings.metrics}
        search={false}
        options={false}
        pagination={false}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: '등록된 임계치가 없습니다.' }}
      />
      {save.isSuccess && <AntAlert type="success" message="저장했습니다." />}
      <SettingsDialog
        id="instance-threshold-dialog"
        title={draft?.originalKey ? '임계치 수정' : '임계치 추가'}
        submitLabel={draft?.originalKey ? '저장' : '등록'}
        isOpen={Boolean(draft)}
        isPending={save.isPending}
        onClose={() => setDraft(undefined)}
        onSubmit={register}
        validation={validation}
        failed={save.isError}
      >
        {draft && (
          <>
            <LabeledField id="threshold-metric" label="항목" help={description?.help}>
              <Select
                id="threshold-metric"
                aria-label="항목"
                value={draft.metricKey}
                onChange={(key) =>
                  setDraft({
                    ...draft,
                    metricKey: key as MetricKey,
                    warning: '',
                    critical: '',
                    certificateTargetId: undefined,
                  })
                }
                options={[
                  { value: '', label: '항목 선택' },
                  ...Object.entries(descriptions)
                    .filter(
                      ([key]) =>
                        key === draft.originalKey ||
                        !settings.metrics.some((metric) => metric.metricKey === key),
                    )
                    .map(([value, item]) => ({ value, label: item.name })),
                ]}
              />
            </LabeledField>
            {draft.metricKey === 'CERTIFICATE_DAYS' && (
              <>
                <LabeledField
                  id="threshold-certificate"
                  label="인증서 대상"
                  help="이 프로젝트에 등록된 인증서를 선택하세요. 다른 인스턴스에 연결된 대상은 제외됩니다."
                >
                  <Select
                    id="threshold-certificate"
                    value={String(draft.certificateTargetId ?? '')}
                    disabled={certificates.isPending || certificates.isError}
                    onChange={(id) =>
                      setDraft({ ...draft, certificateTargetId: id ? Number(id) : undefined })
                    }
                    options={[
                      { value: '', label: '인증서 선택' },
                      ...(certificates.data ?? []).map((target) => ({
                        value: String(target.id),
                        label: target.label,
                      })),
                    ]}
                  />
                </LabeledField>
                {certificates.isError && <Failure message="인증서 대상을 불러오지 못했습니다." />}
                {certificates.isSuccess && !certificates.data.length && (
                  <p className="field-help">
                    선택 가능한 인증서가 없습니다. 인증서 대상 관리에서 먼저 등록해 주세요.
                  </p>
                )}
              </>
            )}
            <div className="threshold-limit-fields">
              <LabeledField
                id="threshold-warning"
                label={`경고 (${description?.unit ?? '%'} ${draft.metricKey === 'CERTIFICATE_DAYS' ? '이하' : '이상'})`}
              >
                <Input
                  id="threshold-warning"
                  aria-label="경고 기준"
                  type="number"
                  min="0"
                  max={description?.unit === '%' ? 100 : undefined}
                  step={draft.metricKey === 'CERTIFICATE_DAYS' ? '1' : 'any'}
                  required
                  disabled={!draft.metricKey}
                  value={draft.warning}
                  onChange={(event) => setDraft({ ...draft, warning: event.target.value })}
                />
              </LabeledField>
              <LabeledField
                id="threshold-critical"
                label={`위험 (${description?.unit ?? '%'} ${draft.metricKey === 'CERTIFICATE_DAYS' ? '이하' : '이상'})`}
              >
                <Input
                  id="threshold-critical"
                  aria-label="위험 기준"
                  type="number"
                  min="0"
                  max={description?.unit === '%' ? 100 : undefined}
                  step={draft.metricKey === 'CERTIFICATE_DAYS' ? '1' : 'any'}
                  required
                  disabled={!draft.metricKey}
                  value={draft.critical}
                  onChange={(event) => setDraft({ ...draft, critical: event.target.value })}
                />
              </LabeledField>
            </div>
            <LabeledField id="threshold-emails" label="알림 이메일">
              <Input
                id="threshold-emails"
                value={draft.emails}
                maxLength={2550}
                placeholder="ops@example.com, dev@example.com (최대 10개)"
                onChange={(event) => setDraft({ ...draft, emails: event.target.value })}
              />
            </LabeledField>
          </>
        )}
      </SettingsDialog>
      <SettingsDialog
        id="delete-instance-threshold"
        title="임계치 삭제"
        submitLabel="삭제"
        isOpen={Boolean(removing)}
        isPending={save.isPending}
        onClose={() => setRemoving(undefined)}
        onSubmit={() => {
          if (removing) {
            save.mutate({
              recipientEmails: settings.recipientEmails,
              metrics: settings.metrics
                .filter((metric) => metric.metricKey !== removing.metricKey)
                .map(writeOf),
            });
          }
        }}
        failed={save.isError}
      >
        {removing && (
          <p>
            {descriptions[removing.metricKey].name} 임계치와 이 항목의 알림 이메일을 삭제합니다.
          </p>
        )}
      </SettingsDialog>
    </div>
  );
}
