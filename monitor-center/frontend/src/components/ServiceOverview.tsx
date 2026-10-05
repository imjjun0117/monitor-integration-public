// 서비스별 지표 현황 표시
import { Link } from 'react-router-dom';
import type { ApiCheck } from '../api';
import { Title, Table, Thead, Tbody, Tr, Th, Td, Label } from './ui';

export default function ServiceOverview({ checks }: { checks: ApiCheck[] }) {
  const cards = checks.filter((check) => check.service_info);
  if (!cards.length) {
    return null;
  }
  return (
    <section className="service-overview" aria-labelledby="service-overview-title">
      <div className="project-comparison-heading">
        <Title headingLevel="h2" id="service-overview-title">
          전체 프로젝트 외부 서비스
        </Title>
        <span>{cards.length}개 서비스</span>
      </div>
      <p>
        프로젝트별 업체와 마지막 조회 값을 함께 확인합니다. 잔액·잔여량 경고는 API 통신 상태와
        별도로 표시합니다.
      </p>
      <Table aria-label="전체 프로젝트 외부 서비스 정보">
        <Thead>
          <Tr>
            <Th>프로젝트 / 실행 서버</Th>
            <Th>서비스</Th>
            <Th>최근 조회 정보</Th>
            <Th>정보 상태</Th>
            <Th>상세</Th>
          </Tr>
        </Thead>
        <Tbody>
          {cards.map((check) => {
            const info = check.service_info!;
            return (
              <Tr key={[check.project_id, check.instance_id, check.check_id].join('/')}>
                <Td>
                  <strong>{check.project_name ?? check.project_id}</strong>
                  <small>{check.instance_name ?? check.instance_id}</small>
                </Td>
                <Td>{info.title}</Td>
                <Td>
                  <ul>
                    {info.metrics.slice(0, 3).map((metric) => (
                      <li key={metric.key}>
                        <span>{metric.label}</span>
                        <strong>
                          {metric.value == null
                            ? '미수집'
                            : typeof metric.value === 'number'
                              ? metric.value.toLocaleString('ko-KR', { maximumFractionDigits: 4 })
                              : typeof metric.value === 'boolean'
                                ? metric.value
                                  ? '예'
                                  : '아니요'
                                : metric.value}
                          {metric.value != null && metric.unit ? ' ' + metric.unit : ''}
                        </strong>
                      </li>
                    ))}
                  </ul>
                </Td>
                <Td>
                  <Label
                    color={
                      info.status === 'DOWN'
                        ? 'red'
                        : info.status === 'WARN'
                          ? 'orange'
                          : info.status === 'UP'
                            ? 'green'
                            : 'grey'
                    }
                  >
                    {info.status === 'DOWN'
                      ? '정보 위험'
                      : info.status === 'WARN'
                        ? '정보 경고'
                        : info.status === 'UP'
                          ? '정보 정상'
                          : '정보 미확인'}
                  </Label>
                </Td>
                <Td>
                  <Link
                    aria-label={
                      (check.project_name ?? check.project_id) + ' ' + info.title + ' 상세'
                    }
                    to={
                      '/api-monitoring?' +
                      new URLSearchParams({
                        project: check.project_id,
                        instance: check.instance_id,
                        check: check.check_id,
                      })
                    }
                  >
                    상세 보기 →
                  </Link>
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </section>
  );
}
