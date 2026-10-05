// 대화상자 및 상세 패널의 표시·포커스 처리
// TailAdmin modal styling with native dialog focus handling. See THIRD_PARTY_NOTICES.md.
import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Button } from './controls';

export const ModalVariant = { small: 'small', medium: 'medium' } as const;
export function Modal({
  isOpen,
  onClose,
  children,
  variant = 'medium',
  closeLabel = '닫기',
  ...props
}: {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  variant?: 'small' | 'medium' | 'drawer' | 'sidebar';
  closeLabel?: string;
} & Pick<HTMLAttributes<HTMLDialogElement>, 'aria-label' | 'aria-labelledby'>) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [sidebarVisible, setSidebarVisible] = useState(isOpen);
  const visible = isOpen || (variant === 'sidebar' && sidebarVisible);
  useEffect(() => {
    if (isOpen) {
      setSidebarVisible(true);
      return;
    }
    if (variant !== 'sidebar' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setSidebarVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setSidebarVisible(false), 180);
    return () => window.clearTimeout(timer);
  }, [isOpen, variant]);
  useEffect(() => {
    if (!visible || !dialog.current) {
      return;
    }
    const element = dialog.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // 브라우저가 아닌 테스트 환경에서만 open 속성으로 대체 처리
    if (typeof element.showModal === 'function') {
      element.showModal();
    } else {
      element.setAttribute('open', '');
    }
    return () => {
      if (typeof element.close === 'function') {
        element.close();
      } else {
        element.removeAttribute('open');
      }
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [visible]);
  if (!visible) {
    return null;
  }
  return createPortal(
    <dialog
      {...props}
      ref={dialog}
      aria-modal="true"
      className={`ta-modal ta-modal-${variant}${!isOpen ? ' is-closing' : ''} rounded-2xl border border-gray-200 bg-white text-gray-800 shadow-theme-lg`}
      onKeyDown={keepFocusInDialog}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <Button variant="plain" className="ta-modal-close" aria-label={closeLabel} onClick={onClose}>
        {variant === 'sidebar' ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M19 12H5m6-6-6 6 6 6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="m5 5 10 10M15 5 5 15"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        )}
      </Button>
      {children}
    </dialog>,
    document.body,
  );
}
function keepFocusInDialog(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== 'Tab') {
    return;
  }
  const controls = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, a[href], [tabindex]',
    ),
  ].filter(
    (element) =>
      !element.matches(':disabled, [tabindex="-1"]') && element.getClientRects().length > 0,
  );
  const first = controls[0];
  const last = controls.at(-1);
  if (!first || !last) {
    event.preventDefault();
    return;
  }
  // Tab 이동을 대화상자 안으로 제한하여 브라우저 도구 영역으로 포커스 이동 방지
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
export function ModalHeader({ title, labelId }: { title: ReactNode; labelId?: string }) {
  return (
    <header className="ta-modal-header">
      <h2 id={labelId} className="m-0 text-xl font-semibold">
        {title}
      </h2>
    </header>
  );
}
export function ModalBody({ children }: { children: ReactNode }) {
  return <div className="ta-modal-body">{children}</div>;
}
export function ModalFooter({ children }: { children: ReactNode }) {
  return <footer className="ta-modal-footer">{children}</footer>;
}

type TabProps = { eventKey: string | number; title: ReactNode; children?: ReactNode };
export function Tab(_props: TabProps) {
  return null;
}
export function TabTitleText({ children }: { children: ReactNode }) {
  return <span>{children}</span>;
}
export function Tabs({
  activeKey,
  onSelect,
  children,
}: {
  activeKey: string | number;
  onSelect: (event: SyntheticEvent, key: string | number) => void;
  children: ReactNode;
}) {
  const id = useId();
  const tabs = Children.toArray(children).filter(isValidElement<TabProps>);
  return (
    <div className="ta-tabs">
      <div role="tablist" aria-label="인스턴스 상세 항목" className="ta-tab-list">
        {tabs.map((tab, index) => (
          <button
            key={tab.props.eventKey}
            role="tab"
            id={`${id}-tab-${index}`}
            aria-controls={`${id}-panel-${index}`}
            aria-selected={activeKey === tab.props.eventKey}
            tabIndex={activeKey === tab.props.eventKey ? 0 : -1}
            className="ta-tab-button"
            onClick={(event) => onSelect(event, tab.props.eventKey)}
            onKeyDown={(event) => {
              const next =
                event.key === 'ArrowRight'
                  ? (index + 1) % tabs.length
                  : event.key === 'ArrowLeft'
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? tabs.length - 1
                        : undefined;
              if (next === undefined) {
                return;
              }
              event.preventDefault();
              (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
              onSelect(event, tabs[next].props.eventKey);
            }}
          >
            {tab.props.title}
          </button>
        ))}
      </div>
      {tabs.map(
        (tab, index) =>
          activeKey === tab.props.eventKey && (
            <div
              key={tab.props.eventKey}
              role="tabpanel"
              tabIndex={0}
              id={`${id}-panel-${index}`}
              aria-labelledby={`${id}-tab-${index}`}
              className="ta-tab-content pt-6"
            >
              {tab.props.children}
            </div>
          ),
      )}
    </div>
  );
}
