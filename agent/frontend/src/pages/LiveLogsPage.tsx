// 명시적으로 선택한 인스턴스의 등록 로그만 조회
import { useSearchParams } from 'react-router-dom';
import { useProjectScope } from '../components/ProjectScope';
import InstanceScope from '../components/InstanceScope';
import LogPanel from '../components/LogPanel';
import { Card, Empty, Form } from 'antd';

export default function LiveLogsPage() {
  const { project } = useProjectScope();
  const [params, setParams] = useSearchParams();
  const instance = params.get('instance') ?? '';
  return (
    <div className="log-panel">
      <Card size="small">
        <Form layout="vertical" className="query-filters">
          <InstanceScope
            project={project}
            instance={instance}
            allowAll={false}
            onChange={(value) => {
              params.set('project', project);
              params.set('instance', value);
              setParams(params);
            }}
          />
        </Form>
      </Card>
      {project && instance ? (
        <LogPanel key={`${project}/${instance}`} projectId={project} instanceId={instance} />
      ) : (
        <Card>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              project
                ? '조회할 인스턴스를 선택하세요. 로그 소스를 열고 조회 시작을 누르면 새 원문을 가져옵니다.'
                : '상단에서 프로젝트를 선택한 다음 조회할 인스턴스를 선택하세요.'
            }
          />
        </Card>
      )}
    </div>
  );
}
