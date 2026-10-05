// 상태 코드에 맞는 이름과 색상 표시
import { Label } from './ui';
import type { Status } from '../generated';

export const statusLabels = { UP: '정상', WARN: '경고', DOWN: '장애', UNKNOWN: '미수집' } as const;
const colors = { UP: 'green', WARN: 'orange', DOWN: 'red', UNKNOWN: 'grey' } as const;

export default function StatusLabel({
  status,
  context,
}: {
  status?: Status | null;
  context?: 'overview' | 'collection' | 'check';
}) {
  const value = status ?? 'UNKNOWN';
  const text =
    context === 'overview'
      ? { UP: '정상', WARN: '주의 필요', DOWN: '확인 필요', UNKNOWN: '미수집' }
      : context === 'collection'
        ? { UP: '수집 정상', WARN: '수집 지연', DOWN: '수집 중단', UNKNOWN: '수집 전' }
        : context === 'check'
          ? { UP: '정상', WARN: '점검 경고', DOWN: '점검 실패', UNKNOWN: '결과 미확인' }
          : statusLabels;
  return <Label color={colors[value]}>{text[value]}</Label>;
}
