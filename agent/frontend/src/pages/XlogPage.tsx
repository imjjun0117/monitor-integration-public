// 프로젝트·인스턴스·기간별 저장 요청 기록 조회
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useProjectScope } from '../components/ProjectScope';
import InstanceScope from '../components/InstanceScope';
import XlogOverview from '../components/XlogOverview';
import { Checkbox, Form, Input, Select } from 'antd';

export default function XlogPage() {
  const { project } = useProjectScope();
  const [params, setParams] = useSearchParams();
  const instance = params.get('instance') ?? '';
  const requestedMinutes = Number(params.get('minutes') ?? 60);
  const minutes = [5, 15, 60, 360, 1440].includes(requestedMinutes) ? requestedMinutes : 60;
  const setMinutes = (value: number) => {
    params.set('minutes', String(value));
    setParams(params);
  };
  const [path, setPath] = useState('');
  const [searchPath, setSearchPath] = useState('');
  const errorsOnly = params.get('errorsOnly') === 'true';
  useEffect(() => {
    const timer = setTimeout(() => setSearchPath(path), 400);
    return () => clearTimeout(timer);
  }, [path]);
  return (
    <>
      <Form layout="vertical">
        <div className="query-filters">
          <InstanceScope
            project={project}
            instance={instance}
            onChange={(value) => {
              params.set('instance', value);
              params.set('project', project);
              setParams(params);
            }}
          />
          <Form.Item label="조회 기간" htmlFor="xlog-period">
            <Select
              id="xlog-period"
              aria-label="XLog 조회 기간"
              value={minutes}
              onChange={setMinutes}
              style={{ minWidth: 130 }}
              options={(
                [
                  [5, '5분'],
                  [15, '15분'],
                  [60, '1시간'],
                  [360, '6시간'],
                  [1440, '24시간'],
                ] as [number, string][]
              ).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Form.Item
            label="요청 경로"
            htmlFor="xlog-path"
            extra="입력 후 잠시 기다리면 결과가 갱신됩니다."
          >
            <Input
              id="xlog-path"
              aria-label="요청 경로 검색"
              placeholder="요청 경로 검색"
              value={path}
              maxLength={200}
              onChange={(event) => setPath(event.target.value)}
            />
          </Form.Item>
          <Form.Item label="HTTP 결과">
            <Checkbox
              checked={errorsOnly}
              onChange={(event) => {
                const next = new URLSearchParams(params);
                if (event.target.checked) next.set('errorsOnly', 'true');
                else next.delete('errorsOnly');
                setParams(next);
              }}
            >
              HTTP 오류만
            </Checkbox>
          </Form.Item>
        </div>
      </Form>
      <XlogOverview
        key={`${project}/${instance}/${minutes}/${searchPath}/${errorsOnly}`}
        project={project}
        instance={instance}
        minutes={minutes}
        path={searchPath}
        errorsOnly={errorsOnly}
        detailed
      />
    </>
  );
}
