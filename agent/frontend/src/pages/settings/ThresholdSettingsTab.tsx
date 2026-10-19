// 프로젝트와 인스턴스 선택 후 해당 서버 임계치 설정
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getProjects, getInstances } from '../../api';
import { useProjectScope } from '../../components/ProjectScope';
import { Loading, Failure } from '../../components/QueryState';
import { FormSelect, FormSelectOption } from '../../components/ui';
import { LabeledField } from './forms';
import InstanceThresholdSettings from './InstanceThresholdSettings';

export default function ThresholdSettingsTab() {
  const { project: selectedProject } = useProjectScope();
  const [project, setProject] = useState(selectedProject);
  const [instance, setInstance] = useState('');
  const projects = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const instances = useQuery({
    queryKey: ['instances', project],
    queryFn: () => getInstances(project),
    enabled: Boolean(project),
  });
  return (
    <div className="threshold-entry">
      <div className="threshold-selectors">
        <LabeledField id="threshold-project" label="프로젝트">
          <FormSelect
            id="threshold-project"
            value={project}
            onChange={(_, next) => {
              setProject(next);
              setInstance('');
            }}
          >
            <FormSelectOption value="" label="프로젝트 선택" />
            {(projects.data?.items ?? []).map((item) => (
              <FormSelectOption
                key={item.project_id}
                value={item.project_id}
                label={item.display_name}
              />
            ))}
          </FormSelect>
        </LabeledField>
        <LabeledField id="threshold-instance" label="인스턴스">
          <FormSelect
            id="threshold-instance"
            value={instance}
            isDisabled={!project || instances.isPending || instances.isError}
            onChange={(_, next) => setInstance(next)}
          >
            <FormSelectOption value="" label="인스턴스 선택" />
            {(instances.data?.items ?? []).map((item) => (
              <FormSelectOption
                key={item.instance_id}
                value={item.instance_id}
                label={item.display_name}
              />
            ))}
          </FormSelect>
        </LabeledField>
      </div>
      {projects.isError && <Failure />}
      {project && instances.isPending && <Loading />}
      {project && instances.isError && <Failure />}
      {project && instances.data && !instances.data.items.length && (
        <p>등록된 인스턴스가 없습니다.</p>
      )}
      {project && instance && (
        <InstanceThresholdSettings
          key={`${project}/${instance}`}
          projectId={project}
          instanceId={instance}
        />
      )}
    </div>
  );
}
