// 접근 가능한 선택 메뉴와 키보드 탐색 구성
import * as Select from '@radix-ui/react-select';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';

type OptionProps = {
  value: string | number;
  label: string;
  isDisabled?: boolean;
  disabled?: boolean;
  searchText?: string;
};
type SelectProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange' | 'value' | 'defaultValue'
> & {
  value?: string | number;
  defaultValue?: string | number;
  required?: boolean;
  onChange?: (event: unknown, value: string) => void;
  isDisabled?: boolean;
  children: ReactNode;
  searchLabel?: string;
};
// Radix로 포커스·키보드 탐색·문자 검색·메뉴 위치 처리
// 메뉴와 항목은 TailAdmin 스타일 적용
export function FormSelect({
  value,
  defaultValue,
  onChange,
  isDisabled,
  disabled,
  children,
  className = '',
  name,
  required,
  searchLabel,
  ...props
}: SelectProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) {
      setSearch('');
      return;
    }
    if (searchLabel) {
      const timer = setTimeout(() => searchInput.current?.focus(), 0);
      return () => clearTimeout(timer);
    }
  }, [open, searchLabel]);
  useEffect(() => {
    if (!open) {
      return;
    }
    // 메뉴 외부 요소는 보조 기술에서 숨기고 inert 처리
    // 숨겨진 입력 요소로 브라우저 포커스 이동 차단
    const siblings = new Map<HTMLElement, boolean>();
    const sync = () =>
      document.querySelectorAll<HTMLElement>('[data-aria-hidden="true"]').forEach((element) => {
        if (!siblings.has(element)) {
          siblings.set(element, element.inert);
          element.inert = true;
        }
      });
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-aria-hidden'],
    });
    return () => {
      observer.disconnect();
      siblings.forEach((previous, element) => {
        element.inert = previous;
      });
    };
  }, [open]);
  const options = Children.toArray(children).filter(isValidElement<OptionProps>);
  const matches = options.filter((option) =>
    `${option.props.label} ${option.props.searchText ?? ''}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const encode = (choice: string | number) => `choice:${choice}`;
  return (
    <div className="ta-select">
      <Select.Root
        open={open}
        onOpenChange={setOpen}
        value={value === undefined ? undefined : encode(value)}
        defaultValue={defaultValue === undefined ? undefined : encode(defaultValue)}
        onValueChange={(next) => onChange?.(undefined, next.slice(7))}
        disabled={disabled || isDisabled}
        required={required}
      >
        <Select.Trigger
          {...props}
          ref={trigger}
          className={`ta-select-trigger ta-input ${className}`}
        >
          <Select.Value>
            {searchLabel
              ? options.find((option) => String(option.props.value) === String(value))?.props.label
              : undefined}
          </Select.Value>
          <Select.Icon className="ta-select-chevron">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="m5 7.5 5 5 5-5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal container={trigger.current?.closest('dialog') ?? undefined}>
          <Select.Content
            aria-label={
              props['aria-label'] ?? trigger.current?.labels?.[0]?.textContent ?? '선택 목록'
            }
            className={`ta-select-menu${searchLabel ? ' scope-select-menu' : ''}${trigger.current?.closest('.settings-content, .settings-dialog') ? ' ta-select-menu-compact' : ''}`}
            position="popper"
            sideOffset={6}
            collisionPadding={12}
            collisionBoundary={trigger.current?.closest('dialog') ?? undefined}
          >
            {searchLabel && (
              <div className="scope-select-search">
                <input
                  ref={searchInput}
                  aria-label={searchLabel}
                  placeholder={searchLabel}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      event.currentTarget
                        .closest('[role="listbox"]')
                        ?.querySelector<HTMLElement>('[role="option"]:not([data-disabled])')
                        ?.focus();
                    }
                    if (event.key !== 'Escape' && event.key !== 'Tab') {
                      event.stopPropagation();
                    }
                  }}
                />
              </div>
            )}
            <Select.ScrollUpButton className="ta-select-scroll" aria-label="이전 항목">
              <ChevronUp size={16} aria-hidden="true" />
            </Select.ScrollUpButton>
            <Select.Viewport className="ta-select-viewport">
              {matches.map((option) => (
                <Select.Item
                  key={encode(option.props.value)}
                  value={encode(option.props.value)}
                  disabled={option.props.isDisabled || option.props.disabled}
                  className="ta-select-option"
                >
                  <Select.ItemText>{option.props.label}</Select.ItemText>
                  <Select.ItemIndicator className="ta-select-check">
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path
                        d="m4 10 4 4 8-8"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
              {matches.length === 0 && <p className="scope-select-empty">검색 결과가 없습니다.</p>}
            </Select.Viewport>
            <Select.ScrollDownButton className="ta-select-scroll" aria-label="다음 항목">
              <ChevronDown size={16} aria-hidden="true" />
            </Select.ScrollDownButton>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
      {name && <input type="hidden" name={name} value={value ?? defaultValue ?? ''} />}
    </div>
  );
}
export function FormSelectOption(_props: OptionProps) {
  return null;
}
