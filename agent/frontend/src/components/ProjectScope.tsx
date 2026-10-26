// 상단 프로젝트 범위와 URL을 동기화하여 메뉴 이동 시 선택 유지
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getProjects } from '../api';
import { Select } from 'antd';

const Scope = createContext<{ project: string; select: (project: string) => void } | null>(null);
export function useProjectScope() {
  const value = useContext(Scope);
  const [project, select] = useState('');
  return value ?? { project, select };
}

export function ProjectScopeProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const explicit = new URLSearchParams(location.search).get('project');
  const pathProject = location.pathname.match(/^\/projects\/([^/]+)/)?.[1];
  const [remembered, remember] = useState(() => {
    try {
      return sessionStorage.getItem('project-scope') ?? '';
    } catch {
      return '';
    }
  });
  const project = pathProject ? decodeURIComponent(pathProject) : (explicit ?? remembered);
  useEffect(() => {
    remember(project);
    try {
      sessionStorage.setItem('project-scope', project);
    } catch {
      // 저장소 제한 시 현재 화면의 선택만 유지
    }
  }, [project]);
  const select = (value: string) => {
    remember(value);
    const params = new URLSearchParams(location.search);
    params.set('project', value);
    params.delete('instance');
    params.delete('page');
    params.delete('check');
    const path = pathProject
      ? value
        ? `/projects/${encodeURIComponent(value)}`
        : '/projects'
      : location.pathname.startsWith('/incidents/')
        ? '/incidents'
        : location.pathname;
    navigate(`${path}?${params}`);
  };
  return <Scope.Provider value={{ project, select }}>{children}</Scope.Provider>;
}

export function ProjectSelector() {
  const { project, select } = useProjectScope();
  const dashboard = useLocation().pathname === '/';
  const query = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const items = query.data?.items ?? [];
  useEffect(() => {
    if (
      query.data &&
      items.length &&
      !items.some((item) => item.project_id === project) &&
      (project || dashboard)
    ) {
      select(dashboard ? items[0].project_id : '');
    }
  }, [query.data, project, dashboard]);
  return (
    <div className="global-project-selector">
      <label className="visually-hidden" htmlFor="global-project-select">
        프로젝트
      </label>
      <Select
        id="global-project-select"
        aria-label="프로젝트 선택"
        showSearch
        filterOption={(input, option) =>
          `${option?.label ?? ''} ${option?.value ?? ''}`
            .toLowerCase()
            .includes(input.toLowerCase())
        }
        value={project}
        onChange={select}
        disabled={query.isPending}
        options={[
          {
            value: '',
            label: query.isError
              ? '프로젝트 조회 실패'
              : dashboard
                ? '프로젝트 선택'
                : '전체 프로젝트',
            disabled: dashboard,
          },
          ...items.map((item) => ({
            value: item.project_id,
            label: item.display_name,
          })),
        ]}
      />
    </div>
  );
}
