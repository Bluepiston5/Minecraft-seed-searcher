import type { ReactNode } from 'react';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Seg<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
  label,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={String(v)} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)} disabled={disabled}>
          {text}
        </button>
      ))}
    </div>
  );
}

export function Stats({ items }: { items: [string, ReactNode][] }) {
  return (
    <div className="stats">
      {items.map(([k, v]) => (
        <div key={k}>
          <span>{k}</span>
          <b>{v}</b>
        </div>
      ))}
    </div>
  );
}

export function StartStop({ running, onStart, onStop, label = 'Start search' }: { running: boolean; onStart: () => void; onStop: () => void; label?: string }) {
  return (
    <div className="row">
      {running ? (
        <button className="btn danger" onClick={onStop}>
          Stop
        </button>
      ) : (
        <button className="btn primary" onClick={onStart}>
          {label}
        </button>
      )}
    </div>
  );
}

export interface ResultItem {
  id: string;
  title: string;
  detail?: string;
}

export function ResultList({ items, onOpen, onCopy, copyLabel = 'Copy seed' }: { items: ResultItem[]; onOpen: (id: string) => void; onCopy: (id: string) => void; copyLabel?: string }) {
  if (!items.length) return null;
  return (
    <ul className="results">
      {items.map((it) => (
        <li key={it.id}>
          <button className="seed" onClick={() => onOpen(it.id)} title="Show on map">
            <code>{it.title}</code>
            {it.detail && <small>{it.detail}</small>}
          </button>
          <button className="icon-btn" onClick={() => onCopy(it.id)} title={copyLabel} aria-label={copyLabel}>
            ⧉
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The current best suggestion of a finder, with accept / reject controls. */
export function SuggestionCard({
  title,
  rows,
  index,
  total,
  busy,
  onReject,
  onCopy,
  onShow,
}: {
  title: string;
  rows: [string, string][];
  index: number;
  total: number | null;
  busy: boolean;
  onReject: () => void;
  onCopy: () => void;
  onShow: () => void;
}) {
  return (
    <div className="suggestion">
      <div className="sg-head">
        <span className="sg-badge">Suggestion {index}</span>
        {total !== null && <span className="sg-count">{total} more found so far</span>}
      </div>
      <button className="sg-title" onClick={onShow} title="Show on map">
        {title}
      </button>
      {rows.map(([k, v]) => (
        <div className="pp-row" key={k}>
          <span>{k}</span>
          <b>{v}</b>
        </div>
      ))}
      <div className="row">
        <button className="btn" onClick={onCopy}>
          Copy /tp
        </button>
        <button className="btn danger" onClick={onReject} disabled={busy}>
          Reject, next
        </button>
      </div>
    </div>
  );
}
