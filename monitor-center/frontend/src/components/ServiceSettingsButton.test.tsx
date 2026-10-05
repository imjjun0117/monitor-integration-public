import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { saveServiceProfile, type ApiCheck } from '../api';
import { Check, ServiceField, Status, type ServiceProfile } from '../generated';
import { selectOption } from '../test-select';
import ServiceSettingsButton from './ServiceSettingsButton';

vi.mock('../api', () => ({ saveServiceProfile: vi.fn() }));
const check: ApiCheck = {
  project_id: 'other-project',
  instance_id: 'prod',
  check_id: 'other-sms',
  name: '다른 문자 업체',
  category: Check.category.API,
  direction: 'EXTERNAL',
  status: Status.UP,
  duration_ms: 20,
  checked_at: null,
  result_code: null,
  message: null,
  history: [],
};
const profile: ServiceProfile = {
  title: '문자 잔여량',
  dashboard: false,
  fields: [
    {
      key: 'sms',
      label: 'SMS 잔여 건수',
      kind: ServiceField.kind.NUMBER,
      source: ServiceField.source.RESPONSE_JSON,
      path: '$.data.remaining',
      unit: '건',
      direction: ServiceField.direction.LOW,
      warning: 100,
      critical: 0,
      required: true,
      when: { path: '$.success', values: [true] },
    },
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(saveServiceProfile).mockResolvedValue();
});
afterEach(cleanup);
function view(value = check) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <ServiceSettingsButton check={value} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: '다른 문자 업체 서비스 설정' }));
}

test('saves provider-specific response mapping for the selected project and instance', async () => {
  view();
  fireEvent.change(screen.getByLabelText('서비스명'), { target: { value: '문자 잔여량' } });
  fireEvent.change(screen.getByLabelText('항목명'), { target: { value: 'SMS 잔여 건수' } });
  await selectOption(screen.getByLabelText('값을 읽을 곳'), 'API JSON 응답');
  fireEvent.change(screen.getByLabelText('응답 항목 경로'), {
    target: { value: '$.data.remaining' },
  });
  fireEvent.change(screen.getByLabelText('단위'), { target: { value: '건' } });
  fireEvent.change(screen.getByLabelText('경고 기준(선택)'), { target: { value: '100' } });
  fireEvent.change(screen.getByLabelText('위험 기준(선택)'), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await waitFor(() =>
    expect(saveServiceProfile).toHaveBeenCalledWith(
      check,
      expect.objectContaining({
        title: '문자 잔여량',
        fields: [
          expect.objectContaining({
            source: 'RESPONSE_JSON',
            path: '$.data.remaining',
            unit: '건',
            warning: 100,
            critical: 0,
          }),
        ],
      }),
    ),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('reuses JSON across projects while preserving conditional mappings', async () => {
  view();
  fireEvent.click(screen.getByText('설정 JSON · 다른 프로젝트에 재사용'));
  fireEvent.change(screen.getByLabelText('서비스 설정 JSON'), {
    target: { value: JSON.stringify(profile) },
  });
  fireEvent.click(screen.getByRole('button', { name: '붙여 넣은 JSON 적용' }));
  expect(screen.getByLabelText('서비스명')).toHaveValue('문자 잔여량');
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(saveServiceProfile).toHaveBeenCalledWith(check, profile));
});

test('rejects invalid JSON paths and inverted thresholds without sending a save', () => {
  view({ ...check, service_profile: profile });
  fireEvent.change(screen.getByLabelText('응답 항목 경로'), { target: { value: '$..remaining' } });
  expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('응답 항목 경로'), {
    target: { value: '$.data.remaining' },
  });
  fireEvent.change(screen.getByLabelText('위험 기준(선택)'), { target: { value: '101' } });
  expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  expect(saveServiceProfile).not.toHaveBeenCalled();
});

test('save failure preserves the edited settings', async () => {
  vi.mocked(saveServiceProfile).mockRejectedValueOnce(new Error('save failed'));
  view({ ...check, service_profile: profile });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  expect(
    await screen.findByText(
      '서비스 설정을 저장하지 못했습니다. 항목 경로와 경고 기준을 확인하세요.',
    ),
  ).toBeVisible();
  expect(screen.getByLabelText('응답 항목 경로')).toHaveValue('$.data.remaining');
  expect(screen.getByRole('dialog')).toBeVisible();
});

test('explicitly disables the service display without changing API execution settings', async () => {
  view({ ...check, service_profile: profile });
  fireEvent.click(screen.getByRole('button', { name: '정보 표시 해제' }));
  await waitFor(() =>
    expect(saveServiceProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: 'other-project',
        instance_id: 'prod',
        check_id: 'other-sms',
      }),
      null,
    ),
  );
});
