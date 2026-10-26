// 서비스별 지표 현황 표시
import { ProTable, type ProColumns } from '@ant-design/pro-components';
import { Space, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import type { ApiCheck } from '../api';

const columns: ProColumns<ApiCheck>[] = [
  {
    title: '프로젝트 / 실행 서버',
    render: (_, check) => (
      <Space direction="vertical" size={0}>
        <Typography.Text strong>{check.project_name ?? check.project_id}</Typography.Text>
        <Typography.Text type="secondary">
          {check.instance_name ?? check.instance_id}
        </Typography.Text>
      </Space>
    ),
  },
  { title: '서비스', render: (_, check) => check.service_info?.title },
  {
    title: '최근 조회 정보',
    render: (_, check) => (
      <ul>
        {check.service_info?.metrics.slice(0, 3).map((metric) => (
          <li key={metric.key}>
            <span>{metric.label}</span>{' '}
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
    ),
  },
  {
    title: '정보 상태',
    render: (_, check) => {
      const status = check.service_info?.status;
      return (
        <Tag
          color={
            status === 'DOWN'
              ? 'red'
              : status === 'WARN'
                ? 'orange'
                : status === 'UP'
                  ? 'green'
                  : 'default'
          }
        >
          {status === 'DOWN'
            ? '정보 위험'
            : status === 'WARN'
              ? '정보 경고'
              : status === 'UP'
                ? '정보 정상'
                : '정보 미확인'}
        </Tag>
      );
    },
  },
  {
    title: '상세',
    render: (_, check) => (
      <Link
        aria-label={
          (check.project_name ?? check.project_id) + ' ' + check.service_info?.title + ' 상세'
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
    ),
  },
];

export default function ServiceOverview({ checks }: { checks: ApiCheck[] }) {
  const cards = checks.filter((check) => check.service_info);
  if (!cards.length) {
    return null;
  }
  return (
    <section className="service-overview" aria-labelledby="service-overview-title">
      <ProTable<ApiCheck>
        aria-label="전체 프로젝트 외부 서비스 정보"
        rowKey={(check) => [check.project_id, check.instance_id, check.check_id].join('/')}
        headerTitle={<h2 id="service-overview-title">전체 프로젝트 외부 서비스</h2>}
        toolBarRender={() => [
          <Typography.Text key="count">{cards.length}개 서비스</Typography.Text>,
        ]}
        columns={columns}
        dataSource={cards}
        search={false}
        options={false}
        pagination={false}
        scroll={{ x: 'max-content' }}
      />
      <Typography.Paragraph>
        프로젝트별 업체와 마지막 조회 값을 함께 확인합니다. 잔액·잔여량 경고는 API 통신 상태와
        별도로 표시합니다.
      </Typography.Paragraph>
    </section>
  );
}
