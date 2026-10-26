// 선택 프로젝트 내에서 인스턴스명·ID·호스트 검색
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getInstances } from '../api';
import { Form, Select } from 'antd';

export default function InstanceScope({
  project,
  instance,
  onChange,
  defaultFirst = false,
  allowAll = true,
}: {
  project: string;
  instance: string;
  onChange: (value: string) => void;
  defaultFirst?: boolean;
  allowAll?: boolean;
}) {
  const query = useQuery({
    queryKey: ['instances', project],
    queryFn: () => getInstances(project),
    enabled: Boolean(project),
  });
  const items = query.data?.items ?? [];
  useEffect(() => {
    if (defaultFirst && items.length && !items.some((item) => item.instance_id === instance)) {
      onChange(items[0].instance_id);
    }
  }, [defaultFirst, query.data, instance, project]);
  return (
    <Form.Item
      className="instance-scope"
      layout="vertical"
      label="인스턴스"
      htmlFor="instance-scope-select"
      style={{ marginBottom: 0 }}
    >
      <Select
        id="instance-scope-select"
        aria-label="인스턴스 선택"
        showSearch
        filterOption={(input, option) =>
          `${option?.label ?? ''} ${option?.value ?? ''} ${option && 'searchText' in option ? option.searchText : ''}`
            .toLowerCase()
            .includes(input.toLowerCase())
        }
        value={instance}
        disabled={!project || query.isPending || query.isError}
        onChange={onChange}
        options={[
          {
            value: '',
            label: !project
              ? '프로젝트를 먼저 선택하세요'
              : query.isError
                ? '인스턴스를 불러오지 못했습니다'
                : query.isPending
                  ? '불러오는 중…'
                  : defaultFirst || !allowAll
                    ? '인스턴스 선택'
                    : '전체 인스턴스',
            disabled: defaultFirst,
          },
          ...items.map((item) => ({
            value: item.instance_id,
            label: item.display_name,
            searchText: `${item.environment ?? ''} ${item.host_name ?? ''}`,
          })),
        ]}
      />
    </Form.Item>
  );
}
