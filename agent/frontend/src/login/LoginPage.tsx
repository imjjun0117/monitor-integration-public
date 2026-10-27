import { ProCard } from '@ant-design/pro-components';
import { Alert, Button, ConfigProvider, Flex, Form, Input, Typography } from 'antd';
import koKR from 'antd/locale/ko_KR';
import { getMonitoringTheme } from '../theme';

export default function LoginPage() {
  const dark = document.documentElement.dataset.theme !== 'light';

  return (
    <ConfigProvider locale={koKR} theme={getMonitoringTheme(dark ? 'dark' : 'light')}>
      <ProCard>
        <Flex align="center" gap={8}>
          <img src="/monitoring.svg" alt="" width="28" height="28" />
          <Typography.Text strong>Monitoring</Typography.Text>
        </Flex>
        <Typography.Title level={1} id="login-title" lang="en">
          Login
        </Typography.Title>
        {document.body.dataset.loginError === 'true' && (
          <Alert role="alert" type="error" showIcon title="아이디 또는 비밀번호를 확인해 주세요." />
        )}
        <Form.Item layout="vertical" label="아이디" htmlFor="username">
          <Input id="username" name="username" autoComplete="username" required autoFocus />
        </Form.Item>
        <Form.Item layout="vertical" label="비밀번호" htmlFor="password">
          <Input.Password id="password" name="password" autoComplete="current-password" required />
        </Form.Item>
        <Button type="primary" htmlType="submit" block lang="en">
          Login
        </Button>
      </ProCard>
    </ConfigProvider>
  );
}
