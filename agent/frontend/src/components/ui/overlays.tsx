// 대화상자 및 상세 패널의 표시·포커스 처리
// Shadcn 대화상자의 포커스 이동 및 배경 접근 제한 적용
import {
  Children,
  isValidElement,
  useId,
  type HTMLAttributes,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import { Dialog, DialogContent, DialogTitle } from '../shadcn/dialog';
import { Button } from './controls';
import { X } from 'lucide-react';

export const ModalVariant = { small: 'small', medium: 'medium' } as const;
export function Modal({
  isOpen,
  onClose,
  children,
  variant = 'medium',
  closeLabel = '닫기',
  className = '',
  closeOnOutside = true,
  ...props
}: {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  variant?: 'small' | 'medium' | 'drawer' | 'sidebar';
  closeLabel?: string;
  className?: string;
  closeOnOutside?: boolean;
} & Pick<HTMLAttributes<HTMLDialogElement>, 'aria-label' | 'aria-labelledby'>) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent
        {...props}
        aria-describedby={undefined}
        showCloseButton={false}
        className={`ta-modal ta-modal-${variant} ${className}`}
        onPointerDownOutside={(event) => {
          if (!closeOnOutside) {
            event.preventDefault();
          }
        }}
      >
        <DialogTitle className="sr-only">{props['aria-label'] ?? '대화상자'}</DialogTitle>
        <Button
          variant="plain"
          className="ta-modal-close"
          aria-label={closeLabel}
          onClick={onClose}
        >
          <X size={22} strokeWidth={2} aria-hidden="true" />
        </Button>
        {children}
      </DialogContent>
    </Dialog>
  );
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
  'aria-label': ariaLabel = '인스턴스 상세 항목',
  children,
}: {
  activeKey: string | number;
  onSelect: (event: SyntheticEvent, key: string | number) => void;
  'aria-label'?: string;
  children: ReactNode;
}) {
  const id = useId();
  const tabs = Children.toArray(children).filter(isValidElement<TabProps>);
  return (
    <div className="ta-tabs">
      <div role="tablist" aria-label={ariaLabel} className="ta-tab-list">
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
