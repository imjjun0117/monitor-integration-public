// 설정 화면의 입력·오류·등록 창 공통 구성
import { usePermissions } from '../../components/PermissionContext';
import {
  Alert,
  Button,
  FormSelect,
  FormSelectOption,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  TextInput,
} from '../../components/ui';
import { cloneElement, isValidElement, useEffect, useState } from 'react';
import type { FormEvent, ReactElement, ReactNode } from 'react';
import { Empty, Failure, Loading } from '../../components/QueryState';

export function LabeledField({
  id,
  label,
  help,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  children: ReactNode;
}) {
  const helpId = `${id}-help`;
  const control =
    help && isValidElement(children)
      ? cloneElement(children as ReactElement<Record<string, unknown>>, {
          'aria-describedby': helpId,
        })
      : children;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {control}
      {help && (
        <span id={helpId} className="field-help">
          {help}
        </span>
      )}
    </div>
  );
}

export function BooleanSelect({
  id,
  label,
  ariaLabel = label,
  help,
  value,
  trueLabel,
  falseLabel,
  falseFirst = false,
  onChange,
}: {
  id: string;
  label: string;
  ariaLabel?: string;
  help?: string;
  value: boolean;
  trueLabel: string;
  falseLabel: string;
  falseFirst?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <LabeledField id={id} label={label} help={help}>
      <FormSelect
        id={id}
        aria-label={ariaLabel}
        value={String(value)}
        onChange={(_, next) => onChange(next === 'true')}
      >
        {(falseFirst
          ? [
              [false, falseLabel],
              [true, trueLabel],
            ]
          : [
              [true, trueLabel],
              [false, falseLabel],
            ]
        ).map(([optionValue, optionLabel]) => (
          <FormSelectOption
            key={String(optionValue)}
            value={String(optionValue)}
            label={String(optionLabel)}
          />
        ))}
      </FormSelect>
    </LabeledField>
  );
}

export function SecretInput({
  id,
  value,
  onChange,
  label = 'Collector 토큰',
  help,
  required = true,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  help?: string;
  required?: boolean;
}) {
  return (
    <LabeledField id={id} label={label} help={help}>
      <TextInput
        id={id}
        aria-label={label}
        type="password"
        autoComplete="new-password"
        value={value}
        onChange={(_, next) => onChange(next)}
        required={required}
      />
    </LabeledField>
  );
}

export function NumberInput({
  id,
  label,
  help,
  value,
  onChange,
  min,
  max,
  step,
  ariaLabel = label,
}: {
  id: string;
  label: string;
  help?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel?: string;
}) {
  const [text, changeText] = useNumericText(value, onChange);
  return (
    <LabeledField id={id} label={label} help={help}>
      <TextInput
        id={id}
        aria-label={ariaLabel}
        type="number"
        value={text}
        min={min}
        max={max}
        step={step}
        onChange={(_, next) => changeText(next)}
      />
    </LabeledField>
  );
}

export function DecimalInput({
  id,
  label,
  value,
  onChange,
  ariaLabel = label,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  ariaLabel?: string;
}) {
  const [text, changeText] = useNumericText(value, onChange);
  return (
    <LabeledField id={id} label={label}>
      <TextInput
        id={id}
        aria-label={ariaLabel}
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(_, next) => changeText(next)}
      />
    </LabeledField>
  );
}

function useNumericText(value: number, onChange: (value: number) => void) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number.isFinite(value) && Number(text) !== value) {
      setText(String(value));
    }
  }, [text, value]);
  function changeText(next: string) {
    setText(next);
    onChange(next.trim() === '' ? Number.NaN : Number(next));
  }
  return [text, changeText] as const;
}

export function QueryContent({
  query,
  empty,
  children,
}: {
  query: { isPending: boolean; isError: boolean };
  empty: boolean;
  children: ReactNode;
}) {
  if (query.isPending) {
    return <Loading />;
  }
  if (query.isError) {
    return <Failure />;
  }
  if (empty) {
    return <Empty />;
  }
  return children;
}

const MUTATION_MESSAGES: Record<string, string> = {
  INVALID_LOG_CONFIG: '로그 이름, 절대 파일 경로, 인코딩과 조회 주기(5~1,800초)를 확인하세요.',
  FORBIDDEN: '이 작업을 실행할 권한이 없습니다.',
  WRITE_FAILED: '변경 내용을 저장하지 못했습니다. 서버 상태를 확인하고 다시 시도하세요.',
  USER_INVALID: '계정 정보와 담당 프로젝트를 확인하세요.',
  PASSWORD_INVALID: '비밀번호는 12자 이상, UTF-8 기준 72바이트 이하로 입력하세요.',
  SELF_ADMIN_REQUIRED: '현재 로그인한 관리자의 역할과 사용 상태는 유지해야 합니다.',
  LAST_ADMIN_REQUIRED: '사용 가능한 관리자가 최소 한 명 필요합니다.',
  PROJECT_ALREADY_EXISTS: '같은 프로젝트 ID가 이미 등록되어 있습니다.',
  INSTANCE_ALREADY_EXISTS: '선택한 프로젝트에 같은 인스턴스 ID가 이미 등록되어 있습니다.',
  AGENT_URL_ALREADY_EXISTS: '같은 Collector Base URL이 이미 다른 인스턴스에 등록되어 있습니다.',
  PROJECT_NOT_FOUND: '선택한 프로젝트가 없거나 비활성 상태입니다. 프로젝트를 다시 선택하세요.',
  INVALID_ID: 'ID 형식이 올바르지 않습니다.',
  INVALID_DISPLAY_NAME: '표시명 형식 또는 길이가 올바르지 않습니다.',
  INSTANCE_URL_INVALID: 'Collector Base URL 형식 또는 길이가 올바르지 않습니다.',
  INSTANCE_INVALID: '인스턴스 입력값의 형식 또는 허용 범위를 확인하세요.',
  PROJECT_INVALID: '프로젝트 입력값의 형식 또는 허용 범위를 확인하세요.',
  DELETE_CONFLICT: '관련 데이터가 사용 중이어서 영구 삭제하지 못했습니다. 잠시 후 다시 시도하세요.',
  CONFLICT: '다른 데이터와 충돌했습니다. 입력값과 기존 등록 항목을 확인하세요.',
  NOT_FOUND: '대상이 이미 삭제되었거나 존재하지 않습니다.',
};

export function MutationError({ failed, error }: { failed: boolean; error?: unknown }) {
  if (!failed) {
    return null;
  }
  const code = (error as { body?: { code?: string } } | undefined)?.body?.code;
  return (
    <Alert
      variant="danger"
      title={
        code
          ? (MUTATION_MESSAGES[code] ??
            '요청을 처리하지 못했습니다. 입력값과 서버 상태를 확인하세요.')
          : '요청을 처리하지 못했습니다. 입력값과 서버 상태를 확인하세요.'
      }
    />
  );
}

export function ValidationAlert({ message }: { message?: string }) {
  return message ? <Alert variant="danger" title={message} /> : null;
}

export function submit(event: FormEvent, action: () => void) {
  event.preventDefault();
  action();
}

// 목록 가독성을 유지하도록 등록·수정 입력은 요청 시 대화상자로 표시
export function SettingsDialog({
  id,
  title,
  submitLabel,
  submitAriaLabel = submitLabel,
  isOpen,
  isPending,
  submitDisabled = false,
  onClose,
  onSubmit,
  validation,
  failed,
  error,
  children,
}: {
  id: string;
  title: string;
  submitLabel: string;
  submitAriaLabel?: string;
  isOpen: boolean;
  isPending: boolean;
  submitDisabled?: boolean;
  onClose: () => void;
  onSubmit: () => void;
  validation?: string;
  failed: boolean;
  error?: unknown;
  children: ReactNode;
}) {
  const { canWrite } = usePermissions();
  if (!isOpen) {
    return null;
  }
  return (
    <Modal
      variant={ModalVariant.medium}
      aria-labelledby={id}
      isOpen
      onClose={() => {
        if (!isPending) {
          onClose();
        }
      }}
    >
      <ModalHeader title={title} labelId={id} />
      <ModalBody>
        <form
          id={`${id}-form`}
          className="settings-form"
          onSubmit={(event) =>
            submit(event, () => {
              if (canWrite) {
                onSubmit();
              }
            })
          }
        >
          {children}
        </form>
        <ValidationAlert message={validation} />
        <MutationError failed={failed} error={error} />
      </ModalBody>
      <ModalFooter>
        <Button
          permission="write"
          type="submit"
          form={`${id}-form`}
          aria-label={submitAriaLabel}
          isLoading={isPending}
          isDisabled={isPending || submitDisabled}
        >
          {submitLabel}
        </Button>
        <Button variant="link" isDisabled={isPending} onClick={onClose}>
          취소
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// 읽기 전용 값 표시. 값이 없으면 공통 빈 값 표시 사용
export function ReadonlyValue({ children }: { children: ReactNode }) {
  const empty = children === null || children === undefined || children === '';
  return (
    <span className={empty ? 'settings-value empty' : 'settings-value'}>
      {empty ? '—' : children}
    </span>
  );
}
