"use client";
// StatusBadge: cycles NOT_STARTED → IN_PROGRESS → DONE on click (1)
interface StatusBadgeProps {
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE';
  onStatusChange?: (next: 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE') => void;
  readonly?: boolean;
}

const STATUS_CYCLE: Record<string, 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE'> = {
  NOT_STARTED: 'IN_PROGRESS',
  IN_PROGRESS: 'DONE',
  DONE: 'NOT_STARTED',
};

const STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'Working on it',
  DONE: 'Done',
};

const STATUS_STYLE: Record<string, string> = {
  NOT_STARTED: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  IN_PROGRESS: 'bg-amber-400 text-white',
  DONE: 'bg-emerald-500 text-white',
};

export function StatusBadge({ status, onStatusChange, readonly = false }: StatusBadgeProps) {
  const handleClick = () => {
    if (!readonly && onStatusChange) {
      onStatusChange(STATUS_CYCLE[status]);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={readonly}
      className={`
        inline-flex items-center justify-center px-3 py-1 rounded text-sm font-medium min-w-[110px]
        ${STATUS_STYLE[status]}
        ${!readonly ? 'cursor-pointer hover:opacity-90 transition-opacity' : 'cursor-default'}
      `}
      aria-label={`Status: ${STATUS_LABEL[status]}${!readonly ? ', click to change' : ''}`}
    >
      {STATUS_LABEL[status]}
    </button>
  );
}
