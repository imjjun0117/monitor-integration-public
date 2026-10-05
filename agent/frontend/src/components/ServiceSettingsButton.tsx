// 서비스 지표 조회 설정 변경
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { saveServiceProfile, type ApiCheck } from '../api';
import { ServiceField, type ServiceProfile } from '../generated';
import {
  Alert,
  Button,
  FormSelect,
  FormSelectOption,
  Modal,
  ModalBody,
  ModalHeader,
  TextInput,
} from './ui';
import { LabeledField } from '../pages/settings/forms';

const freshField = (key: string): ServiceField => ({
  key,
  label: '잔여량',
  source: ServiceField.source.DETAILS,
  path: '$.balance',
  kind: ServiceField.kind.NUMBER,
  unit: '',
  direction: ServiceField.direction.LOW,
  required: true,
});
const pathPattern = /^\$(?:\.[A-Za-z_][A-Za-z0-9_-]*|\[[0-9]{1,5}\]){1,12}$/;

export default function ServiceSettingsButton({ check }: { check: ApiCheck }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ServiceProfile>({
    title: check.name,
    description: '',
    dashboard: true,
    fields: [freshField('field_1')],
  });
  const [jsonDraft, setJsonDraft] = useState('');
  const [jsonError, setJsonError] = useState(false);
  const client = useQueryClient();
  const valid =
    draft.title.trim().length > 0 &&
    draft.title.length <= 120 &&
    draft.fields.length > 0 &&
    draft.fields.length <= 16 &&
    draft.fields.every(
      (field) =>
        field.label.trim() &&
        field.label.length <= 120 &&
        pathPattern.test(field.path) &&
        (field.unit?.length ?? 0) <= 16 &&
        [field.warning, field.critical].every((value) => value == null || Number.isFinite(value)) &&
        (field.warning == null ||
          field.critical == null ||
          (field.direction === 'HIGH'
            ? field.critical >= field.warning
            : field.critical <= field.warning)),
    );
  const save = useMutation({
    mutationFn: (profile: ServiceProfile | null) => saveServiceProfile(check, profile),
    onSuccess: async () => {
      setOpen(false);
      await Promise.all(
        ['api-checks', 'dashboard'].map((key) => client.invalidateQueries({ queryKey: [key] })),
      );
    },
  });
  function edit() {
    setDraft(
      structuredClone(
        check.service_profile ?? {
          title: check.name,
          description: '',
          dashboard: true,
          fields: [freshField('field_1')],
        },
      ),
    );
    setJsonDraft('');
    setJsonError(false);
    save.reset();
    setOpen(true);
  }
  function change(index: number, values: Partial<ServiceField>) {
    setDraft((previous) => ({
      ...previous,
      fields: previous.fields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...values } : field,
      ),
    }));
  }
  function add() {
    let number = 1;
    while (draft.fields.some((field) => field.key === `field_${number}`)) {
      number++;
    }
    setDraft({ ...draft, fields: [...draft.fields, freshField(`field_${number}`)] });
  }
  function loadJson() {
    try {
      const value = JSON.parse(jsonDraft) as ServiceProfile;
      if (
        !value ||
        typeof value.title !== 'string' ||
        typeof value.dashboard !== 'boolean' ||
        !Array.isArray(value.fields) ||
        value.fields.length < 1 ||
        value.fields.length > 16 ||
        value.fields.some(
          (field) =>
            !field ||
            typeof field.label !== 'string' ||
            typeof field.key !== 'string' ||
            typeof field.path !== 'string' ||
            !['NUMBER', 'TEXT', 'BOOLEAN'].includes(field.kind) ||
            !['DETAILS', 'RESPONSE_JSON'].includes(field.source),
        )
      ) {
        throw new Error();
      }
      setDraft(value);
      setJsonError(false);
    } catch {
      setJsonError(true);
    }
  }
  return (
    <>
      <Button
        permission="write"
        variant="secondary"
        size="sm"
        onClick={edit}
        aria-label={`${check.name} 서비스 설정`}
      >
        서비스 설정
      </Button>
      <Modal
        isOpen={open}
        variant="medium"
        aria-label="서비스 설정"
        closeLabel="서비스 설정 닫기"
        onClose={() => {
          if (!save.isPending) {
            setOpen(false);
          }
        }}
      >
        <ModalHeader title="서비스 설정" />
        <ModalBody>
          <p>
            {check.project_name ?? check.project_id} / {check.instance_name ?? check.instance_id} ·{' '}
            {check.name}
          </p>
          <p className="service-balance-note">
            프로젝트마다 다른 업체의 잔액·잔여 건수·상태를 같은 화면으로 표시합니다. 저장은 API를
            실행하지 않으며, 이미 수집한 결과에서 값을 읽습니다.
          </p>
          <form
            className="service-settings-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (valid && !save.isPending) {
                save.mutate(draft);
              }
            }}
          >
            <LabeledField id="service-title" label="서비스명">
              <TextInput
                id="service-title"
                value={draft.title}
                maxLength={120}
                isDisabled={save.isPending}
                onChange={(_, title) => setDraft({ ...draft, title })}
              />
            </LabeledField>
            <LabeledField id="service-description" label="정보 설명">
              <TextInput
                id="service-description"
                value={draft.description ?? ''}
                maxLength={500}
                isDisabled={save.isPending}
                onChange={(_, description) => setDraft({ ...draft, description })}
              />
            </LabeledField>
            <LabeledField id="service-dashboard" label="종합 대시보드에 표시">
              <FormSelect
                id="service-dashboard"
                value={String(draft.dashboard)}
                isDisabled={save.isPending}
                onChange={(_, value) => setDraft({ ...draft, dashboard: value === 'true' })}
              >
                <FormSelectOption value="true" label="표시" />
                <FormSelectOption value="false" label="API 화면에만 표시" />
              </FormSelect>
            </LabeledField>
            <p className="service-balance-note">
              숫자 항목에 경고·위험 기준을 설정할 수 있습니다. 이 기준은 서비스 정보 카드에 적용하며
              API 요청의 성공 조건은 기존 점검 설정을 사용합니다.
            </p>
            {draft.fields.map((field, index) => (
              <fieldset key={field.key} className="service-field-editor">
                <legend>표시 항목 {index + 1}</legend>
                <div className="service-editor-grid">
                  <LabeledField id={`service-label-${index}`} label="항목명">
                    <TextInput
                      id={`service-label-${index}`}
                      value={field.label}
                      maxLength={120}
                      isDisabled={save.isPending}
                      onChange={(_, label) => change(index, { label })}
                    />
                  </LabeledField>
                  <LabeledField id={`service-kind-${index}`} label="값 종류">
                    <FormSelect
                      id={`service-kind-${index}`}
                      value={field.kind}
                      isDisabled={save.isPending}
                      onChange={(_, kind) =>
                        change(index, {
                          kind: kind as ServiceField.kind,
                          ...(kind !== 'NUMBER' ? { warning: null, critical: null } : {}),
                        })
                      }
                    >
                      <FormSelectOption value="NUMBER" label="숫자" />
                      <FormSelectOption value="TEXT" label="문자" />
                      <FormSelectOption value="BOOLEAN" label="예 / 아니요" />
                    </FormSelect>
                  </LabeledField>
                  <LabeledField id={`service-source-${index}`} label="값을 읽을 곳">
                    <FormSelect
                      id={`service-source-${index}`}
                      value={field.source}
                      isDisabled={save.isPending}
                      onChange={(_, source) =>
                        change(index, { source: source as ServiceField.source })
                      }
                    >
                      <FormSelectOption value="DETAILS" label="SDK 수집 결과" />
                      <FormSelectOption value="RESPONSE_JSON" label="API JSON 응답" />
                    </FormSelect>
                  </LabeledField>
                  <LabeledField
                    id={`service-path-${index}`}
                    label="응답 항목 경로"
                    help="예: $.balance, $.data.remaining"
                  >
                    <TextInput
                      id={`service-path-${index}`}
                      value={field.path}
                      isDisabled={save.isPending}
                      onChange={(_, path) => change(index, { path })}
                    />
                  </LabeledField>
                  <LabeledField id={`service-unit-${index}`} label="단위">
                    <TextInput
                      id={`service-unit-${index}`}
                      value={field.unit ?? ''}
                      maxLength={16}
                      placeholder="P, 원, 건, 회, %"
                      isDisabled={save.isPending}
                      onChange={(_, unit) => change(index, { unit })}
                    />
                  </LabeledField>
                  {field.kind === 'NUMBER' && (
                    <>
                      <LabeledField id={`service-direction-${index}`} label="경고 방향">
                        <FormSelect
                          id={`service-direction-${index}`}
                          value={field.direction ?? 'LOW'}
                          isDisabled={save.isPending}
                          onChange={(_, direction) =>
                            change(index, { direction: direction as ServiceField.direction })
                          }
                        >
                          <FormSelectOption value="LOW" label="기준 이하" />
                          <FormSelectOption value="HIGH" label="기준 이상" />
                        </FormSelect>
                      </LabeledField>
                      <LabeledField id={`service-warning-${index}`} label="경고 기준(선택)">
                        <TextInput
                          id={`service-warning-${index}`}
                          type="number"
                          step="any"
                          value={field.warning ?? ''}
                          isDisabled={save.isPending}
                          onChange={(_, value) =>
                            change(index, { warning: value === '' ? null : Number(value) })
                          }
                        />
                      </LabeledField>
                      <LabeledField id={`service-critical-${index}`} label="위험 기준(선택)">
                        <TextInput
                          id={`service-critical-${index}`}
                          type="number"
                          step="any"
                          value={field.critical ?? ''}
                          isDisabled={save.isPending}
                          onChange={(_, value) =>
                            change(index, { critical: value === '' ? null : Number(value) })
                          }
                        />
                      </LabeledField>
                    </>
                  )}
                </div>
                <label className="service-required">
                  <input
                    type="checkbox"
                    checked={field.required ?? false}
                    disabled={save.isPending}
                    onChange={(event) => change(index, { required: event.target.checked })}
                  />
                  필수 값 · 미수집이면 정보 미확인으로 표시
                </label>
                <Button
                  permission="write"
                  variant="danger"
                  size="sm"
                  isDisabled={save.isPending || draft.fields.length === 1}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      fields: draft.fields.filter((_, fieldIndex) => fieldIndex !== index),
                    })
                  }
                >
                  항목 {index + 1} 삭제
                </Button>
              </fieldset>
            ))}
            <Button
              permission="write"
              variant="secondary"
              isDisabled={save.isPending || draft.fields.length >= 16}
              onClick={add}
            >
              항목 추가
            </Button>
            <details className="service-json-settings">
              <summary>설정 JSON · 다른 프로젝트에 재사용</summary>
              <p className="service-balance-note">
                설정을 복사해 다른 API의 서비스 설정에 붙여 넣을 수 있습니다. 값 표시 조건과 코드별
                이름도 JSON으로 설정할 수 있습니다.
              </p>
              <Button
                permission="write"
                variant="secondary"
                size="sm"
                onClick={() => setJsonDraft(JSON.stringify(draft, null, 2))}
              >
                JSON 보기
              </Button>
              <label htmlFor="service-profile-json">서비스 설정 JSON</label>
              <textarea
                id="service-profile-json"
                value={jsonDraft}
                maxLength={16000}
                disabled={save.isPending}
                onChange={(event) => setJsonDraft(event.target.value)}
              />
              <Button
                permission="write"
                variant="secondary"
                size="sm"
                isDisabled={!jsonDraft || save.isPending}
                onClick={loadJson}
              >
                붙여 넣은 JSON 적용
              </Button>
              {jsonError && <Alert variant="danger" title="서비스 설정 JSON을 확인하세요." />}
            </details>
            {save.isError && (
              <Alert
                variant="danger"
                title="서비스 설정을 저장하지 못했습니다. 항목 경로와 경고 기준을 확인하세요."
              />
            )}
            <div className="check-settings-actions">
              <Button
                permission="write"
                variant="danger"
                isDisabled={save.isPending}
                onClick={() => save.mutate(null)}
              >
                정보 표시 해제
              </Button>
              <Button
                permission="write"
                variant="secondary"
                isDisabled={save.isPending}
                onClick={() => setOpen(false)}
              >
                취소
              </Button>
              <Button
                permission="write"
                type="submit"
                isLoading={save.isPending}
                isDisabled={!valid}
              >
                저장
              </Button>
            </div>
          </form>
        </ModalBody>
      </Modal>
    </>
  );
}
