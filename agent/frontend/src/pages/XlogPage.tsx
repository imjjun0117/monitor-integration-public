// 프로젝트·인스턴스·기간별 저장 요청 기록 조회
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ProjectSelector, useProjectScope } from '../components/ProjectScope';
import InstanceScope from '../components/InstanceScope';
import XlogOverview from '../components/XlogOverview';
import { Button, Card, Checkbox, Form, Input, Select } from 'antd';

export default function XlogPage({
  projectId,
  instanceId,
}: { projectId?: string; instanceId?: string } = {}) {
  const { project: scopedProject } = useProjectScope();
  const client = useQueryClient();
  const project = projectId ?? scopedProject;
  const [params, setParams] = useSearchParams();
  const instance = instanceId ?? params.get('instance') ?? '';
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
  const filters = (
    <Form
      layout="vertical"
      aria-label="XLog 필터"
      className={instanceId ? 'xlog-inline-filters' : undefined}
    >
      <div className="query-filters">
        {projectId === undefined && (
          <Form.Item label="프로젝트" htmlFor="xlog-project-select">
            <ProjectSelector id="xlog-project-select" ariaLabel="XLog 프로젝트 필터" />
          </Form.Item>
        )}
        {instanceId === undefined && (
          <InstanceScope
            project={project}
            instance={instance}
            onChange={(value) => {
              params.set('instance', value);
              params.set('project', project);
              setParams(params);
            }}
          />
        )}
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
              if (event.target.checked) {
                next.set('errorsOnly', 'true');
              } else {
                next.delete('errorsOnly');
              }
              setParams(next);
            }}
          >
            HTTP 오류만
          </Checkbox>
        </Form.Item>
      </div>
    </Form>
  );
  return (
    <>
      <div className="xlog-page-toolbar">
        <p>저장된 요청의 응답시간과 HTTP 결과를 조회합니다.</p>
        <Button
          aria-label="XLog 새로고침"
          onClick={() =>
            void client.invalidateQueries({
              queryKey: ['xlog', project, instance, minutes, searchPath, errorsOnly],
            })
          }
        >
          새로고침
        </Button>
      </div>
      {instanceId ? (
        filters
      ) : (
        <Card
          size="small"
          title="XLog 필터"
          role="region"
          aria-label="XLog 필터"
          className="xlog-filter-card"
        >
          {filters}
        </Card>
      )}
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
