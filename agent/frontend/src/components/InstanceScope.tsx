// 선택 프로젝트 내에서 인스턴스명·ID·호스트 검색
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getInstances } from '../api';
import { FormSelect, FormSelectOption } from './ui';

export default function InstanceScope({
  project,
  instance,
  onChange,
  defaultFirst = false,
}: {
  project: string;
  instance: string;
  onChange: (value: string) => void;
  defaultFirst?: boolean;
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
    <div className="instance-scope">
      <FormSelect
        aria-label="인스턴스 선택"
        searchLabel="인스턴스 검색"
        value={instance}
        isDisabled={!project || query.isPending || query.isError}
        onChange={(_, value) => onChange(value)}
      >
        <FormSelectOption
          value=""
          label={
            !project
              ? '프로젝트를 먼저 선택하세요'
              : query.isError
                ? '인스턴스를 불러오지 못했습니다'
                : query.isPending
                  ? '불러오는 중…'
                  : defaultFirst
                    ? '인스턴스 선택'
                    : '전체 인스턴스'
          }
          isDisabled={defaultFirst}
        />
        {items.map((item) => (
          <FormSelectOption
            key={item.instance_id}
            value={item.instance_id}
            label={item.display_name}
            searchText={`${item.instance_id} ${item.environment ?? ''} ${item.host_name ?? ''}`}
          />
        ))}
      </FormSelect>
    </div>
  );
}
