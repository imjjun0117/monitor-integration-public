// 이전 목록 화면 이동 링크 표시
import { Link } from 'react-router-dom';

export default function PageBackLink({ to, children }: { to: string; children: string }) {
  return (
    <Link className="page-back-link" to={to}>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
      <span>{children}</span>
    </Link>
  );
}
