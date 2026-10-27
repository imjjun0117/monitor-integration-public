// 점검 사용 여부·자동 실행·주기 설정 변경
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ProForm } from '@ant-design/pro-components';
import { Alert, Button, Flex, Form, Input, Modal, Select } from 'antd';
import { saveCheckSettings, type ApiCheck } from '../api';
import { usePermissions } from './PermissionContext';
import { automaticEnabled, checkInterval, checkName } from '../utils/checkPresentation';

export default function CheckSettingsButton({ check }: { check: ApiCheck }) {
  const [open, setOpen] = useState(false);
  const [used, setUsed] = useState(true);
  const [automatic, setAutomatic] = useState(false);
  const [minutes, setMinutes] = useState('5');
  const { canWrite } = usePermissions();
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
      {canWrite && (
        <Button onClick={edit} aria-label={`${name} 점검 설정`}>
          설정
        </Button>
      )}
      <Modal
        open={open}
        title={`${name} 점검 설정`}
        aria-label={`${name} 점검 설정`}
        closable={false}
        footer={null}
        mask={{ closable: false }}
        destroyOnHidden
        transitionName=""
        maskTransitionName=""
        onCancel={() => {
          if (!save.isPending) {
            setOpen(false);
          }
        }}
      >
        <ProForm
          layout="vertical"
          submitter={false}
          onFinish={async () => {
            if (valid && !save.isPending) {
              save.mutate();
            }
            return true;
          }}
        >
          <Form.Item
            label="점검 사용 여부"
            htmlFor="check-used"
            extra="미사용은 자동·수동 점검과 상태 집계에서 제외합니다. 기존 결과는 보관합니다."
          >
            <Select
              id="check-used"
              aria-label="점검 사용 여부"
              value={used ? 'true' : 'false'}
              disabled={save.isPending}
              onChange={(value) => setUsed(value === 'true')}
              options={[
                { value: 'true', label: '사용' },
                { value: 'false', label: '미사용' },
              ]}
            />
          </Form.Item>
          <Form.Item
            label="자동 실행"
            htmlFor="check-automatic"
            extra="자동 미사용이어도 점검 사용 상태라면 수동으로 실행할 수 있습니다."
          >
            <Select
              id="check-automatic"
              aria-label="자동 실행"
              value={automatic ? 'true' : 'false'}
              disabled={!used || save.isPending}
              onChange={(value) => setAutomatic(value === 'true')}
              options={[
                { value: 'true', label: '사용' },
                { value: 'false', label: '미사용' },
              ]}
            />
          </Form.Item>
          <Form.Item
            label="점검 주기(분)"
            htmlFor="check-interval"
            extra="마지막 점검 이후 설정한 주기가 지나면 자동 실행합니다."
          >
            <Input
              id="check-interval"
              placeholder="1~10,080분 (최대 7일)"
              aria-label="점검 주기(분)"
              type="number"
              min={1}
              max={10080}
              step={1}
              value={minutes}
              disabled={!used || !automatic || save.isPending}
              onChange={(event) => setMinutes(event.target.value)}
            />
          </Form.Item>
          {used && automatic && check.automatic_allowed === false && (
            <Alert
              type="warning"
              title="인스턴스 설정에서 자동 실행이 중지되어 있습니다."
              description="프로젝트와 인스턴스 수집을 사용으로 설정하세요. API는 인스턴스의 API 자동 점검도 켜져 있어야 실행됩니다."
            />
          )}
          {save.isError && (
            <Alert type="error" title="점검 설정을 저장하지 못했습니다. 다시 시도하세요." />
          )}
          <Flex justify="end" gap="small" wrap>
            <Button disabled={save.isPending} onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button type="primary" htmlType="submit" loading={save.isPending} disabled={!valid}>
              저장
            </Button>
          </Flex>
        </ProForm>
      </Modal>
    </>
  );
}
