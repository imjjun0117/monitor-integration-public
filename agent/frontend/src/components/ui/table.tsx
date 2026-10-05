// 목록·페이지 이동·선택 동작의 공통 구성
// Adapted from TailAdmin's MIT table components. See THIRD_PARTY_NOTICES.md.
import {
  useId,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type TableHTMLAttributes,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from 'react';

export function Table({
  variant: _variant,
  className = '',
  ...props
}: TableHTMLAttributes<HTMLTableElement> & { variant?: 'compact' }) {
  const ref = useRef<HTMLTableElement>(null);
  const id = useId();
  useLayoutEffect(() => {
    const table = ref.current;
    if (!table) {
      return;
    }
    const headings = Array.from(table.tHead?.rows[0]?.cells ?? []);
    headings.forEach((cell, column) => {
      if (!cell.id) {
        cell.id = `${id}-column-${column}`;
      }
    });
    const labels = headings.map((cell) => cell.textContent?.trim() ?? '');
    for (const body of Array.from(table.tBodies)) {
      for (const row of Array.from(body.rows)) {
        let column = 0;
        for (const cell of Array.from(row.cells)) {
          if (cell.colSpan === 1) {
            cell.dataset.label = cell.dataset.explicitLabel ?? labels[column] ?? '';
          }
          if (!cell.hasAttribute('headers')) {
            cell.setAttribute(
              'headers',
              headings
                .slice(column, column + cell.colSpan)
                .map((heading) => heading.id)
                .join(' '),
            );
          }
          column += cell.colSpan;
        }
      }
    }
  });
  return (
    <div className="ta-table-scroll max-w-full overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table
        ref={ref}
        {...props}
        className={`ta-table w-full border-collapse text-left text-sm ${className}`}
      />
    </div>
  );
}
export function Thead(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} className={`bg-gray-50 ${props.className ?? ''}`} />;
}
export function Tbody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} className={`divide-y divide-gray-200 ${props.className ?? ''}`} />;
}
export function Tr(props: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr {...props} className={`transition-colors hover:bg-gray-50/60 ${props.className ?? ''}`} />
  );
}
export function Th({ className = '', ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      {...props}
      className={`border-b border-gray-200 px-5 py-3 text-xs font-medium text-gray-600 ${className}`}
    />
  );
}
export function Td({
  dataLabel,
  className = '',
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { dataLabel?: string }) {
  return (
    <td
      {...props}
      data-explicit-label={dataLabel}
      className={`px-5 py-4 text-gray-700 align-middle ${className}`}
    />
  );
}
