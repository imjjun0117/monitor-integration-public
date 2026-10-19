// 프로젝트·인스턴스·기간별 저장 요청 기록 조회
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useProjectScope } from '../components/ProjectScope';
import InstanceScope from '../components/InstanceScope';
import XlogOverview from '../components/XlogOverview';
import { FormSelect, FormSelectOption, TextInput } from '../components/ui';

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
  const [errorsOnly, setErrorsOnly] = useState(params.get('errorsOnly') === 'true');
  useEffect(() => {
    const timer = setTimeout(() => setSearchPath(path), 400);
    return () => clearTimeout(timer);
  }, [path]);
  return (
    <>
      <section className="observability-toolbar">
        <InstanceScope
          project={project}
          instance={instance}
          onChange={(value) => {
            params.set('instance', value);
            params.set('project', project);
            setParams(params);
          }}
        />
        <FormSelect
          aria-label="XLog 조회 기간"
          value={minutes}
          onChange={(_, value) => setMinutes(Number(value))}
        >
          {[
            [5, '5분'],
            [15, '15분'],
            [60, '1시간'],
            [360, '6시간'],
            [1440, '24시간'],
          ].map(([value, label]) => (
            <FormSelectOption key={value} value={value} label={String(label)} />
          ))}
        </FormSelect>
        <TextInput
          aria-label="요청 경로 검색"
          placeholder="요청 경로 검색"
          value={path}
          maxLength={200}
          onChange={(_, value) => setPath(value)}
        />
        <label>
          <input
            type="checkbox"
            checked={errorsOnly}
            onChange={(event) => setErrorsOnly(event.target.checked)}
          />{' '}
          HTTP 오류만
        </label>
      </section>
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
