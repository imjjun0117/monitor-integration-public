// 명시적으로 선택한 인스턴스의 등록 로그만 조회
import { useSearchParams } from 'react-router-dom';
import { useProjectScope } from '../components/ProjectScope';
import InstanceScope from '../components/InstanceScope';
import LogPanel from '../components/LogPanel';
import { Empty } from '../components/QueryState';

export default function LiveLogsPage() {
  const { project } = useProjectScope();
  const [params, setParams] = useSearchParams();
  const instance = params.get('instance') ?? '';
  return (
    <>
      <section className="observability-toolbar">
        <InstanceScope
          project={project}
          instance={instance}
          onChange={(value) => {
            params.set('project', project);
            params.set('instance', value);
            setParams(params);
          }}
        />
      </section>
      {project && instance ? (
        <LogPanel key={`${project}/${instance}`} projectId={project} instanceId={instance} />
      ) : (
        <Empty>상단에서 프로젝트를 선택하고 조회할 인스턴스를 선택하세요.</Empty>
      )}
    </>
  );
}
