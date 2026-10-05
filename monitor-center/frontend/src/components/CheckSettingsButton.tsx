// 점검 사용 여부·자동 실행·주기 설정 변경
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { saveCheckSettings, type ApiCheck } from '../api';
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
import { automaticEnabled, checkInterval, checkName } from '../utils/checkPresentation';
import { LabeledField } from '../pages/settings/forms';

export default function CheckSettingsButton({ check }: { check: ApiCheck }) {
  const [open, setOpen] = useState(false);
  const [used, setUsed] = useState(true);
  const [automatic, setAutomatic] = useState(false);
  const [minutes, setMinutes] = useState('5');
  const client = useQueryClient();
  const valid = /^\d+$/.test(minutes) && Number(minutes) >= 1 && Number(minutes) <= 10080;
  const save = useMutation({
    mutationFn: () =>
      saveCheckSettings(check, {
        monitoringEnabled: used,
        automaticEnabled: automatic,
        checkIntervalSeconds: Number(minutes) * 60,
      }),
    onSuccess: async () => {
      setOpen(false);
      await Promise.all(
        ['api-checks', 'internal-checks', 'dashboard', 'projects', 'instances', 'resources'].map(
          (key) => client.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
  const name = checkName(check);
  function edit() {
    setUsed(check.monitoring_enabled !== false);
    setAutomatic(automaticEnabled(check));
    setMinutes(String(Math.ceil(checkInterval(check) / 60)));
    save.reset();
    setOpen(true);
  }
  return (
    <>
      <Button
        permission="write"
        variant="secondary"
        size="sm"
        onClick={edit}
        aria-label={`${name} 점검 설정`}
      >
        설정
      </Button>
      <Modal
        isOpen={open}
        variant="small"
        aria-label={`${name} 점검 설정`}
        closeLabel="점검 설정 닫기"
        onClose={() => {
          if (!save.isPending) {
            setOpen(false);
          }
        }}
      >
        <ModalHeader title="점검 설정" />
        <ModalBody>
          <p className="check-settings-name">{name}</p>
          <form
            className="check-settings-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (valid && !save.isPending) {
                save.mutate();
              }
            }}
          >
            <LabeledField
              id="check-used"
              label="점검 사용 여부"
              help="미사용은 자동·수동 점검과 상태 집계에서 제외합니다. 기존 결과는 보관합니다."
            >
              <FormSelect
                id="check-used"
                aria-label="점검 사용 여부"
                value={String(used)}
                isDisabled={save.isPending}
                onChange={(_, value) => setUsed(value === 'true')}
              >
                <FormSelectOption value="true" label="사용" />
                <FormSelectOption value="false" label="미사용" />
              </FormSelect>
            </LabeledField>
            <LabeledField
              id="check-automatic"
              label="자동 실행"
              help="자동 미사용이어도 점검 사용 상태라면 수동으로 실행할 수 있습니다."
            >
              <FormSelect
                id="check-automatic"
                aria-label="자동 실행"
                value={String(automatic)}
                isDisabled={!used || save.isPending}
                onChange={(_, value) => setAutomatic(value === 'true')}
              >
                <FormSelectOption value="true" label="사용" />
                <FormSelectOption value="false" label="미사용" />
              </FormSelect>
            </LabeledField>
            <LabeledField
              id="check-interval"
              label="점검 주기(분)"
              help="1분부터 7일(10,080분)까지 설정할 수 있습니다. 저장 후 마지막 점검으로부터 이 시간이 지나면 자동 실행합니다."
            >
              <TextInput
                id="check-interval"
                aria-label="점검 주기(분)"
                type="number"
                min={1}
                max={10080}
                step={1}
                value={minutes}
                isDisabled={!used || !automatic || save.isPending}
                onChange={(_, value) => setMinutes(value)}
              />
            </LabeledField>
            {used && automatic && check.automatic_allowed === false && (
              <Alert variant="warning" title="인스턴스 설정에서 자동 실행이 중지되어 있습니다.">
                프로젝트와 인스턴스 수집을 사용으로 설정하세요. API는 인스턴스의 API 자동 점검도
                켜져 있어야 실행됩니다.
              </Alert>
            )}
            {save.isError && (
              <Alert variant="danger" title="점검 설정을 저장하지 못했습니다. 다시 시도하세요." />
            )}
            <div className="check-settings-actions">
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
