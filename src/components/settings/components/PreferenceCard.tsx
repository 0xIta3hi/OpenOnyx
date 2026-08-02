import React from "react";

export interface PreferenceCardProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function PreferenceCard({
  title,
  description,
  badge,
  children,
  className = "",
  onClick,
}: PreferenceCardProps) {
  return (
    <div
      onClick={onClick}
      className={`group relative flex flex-col justify-between gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5 transition-all duration-150 hover:border-[var(--border-medium)] ${
        onClick ? "cursor-pointer" : ""
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-[14px] font-bold text-[var(--text-primary)]">
              {title}
            </h4>
            {badge && (
              <span className="inline-flex items-center rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)] border border-[var(--border-subtle)]">
                {badge}
              </span>
            )}
          </div>
          {description && (
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-muted)]">
              {description}
            </p>
          )}
        </div>
      </div>
      {children && <div className="mt-1 flex items-center justify-end gap-3">{children}</div>}
    </div>
  );
}

export interface SegmentedControlOption<T extends string | number> {
  value: T;
  label: React.ReactNode;
  description?: string;
}

export interface SegmentedControlProps<T extends string | number> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (val: T) => void;
  className?: string;
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  className = "",
}: SegmentedControlProps<T>) {
  return (
    <div
      className={`inline-flex items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-1 ${className}`}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`relative flex items-center justify-center rounded-md px-3 py-1 text-[12px] font-semibold transition-all duration-150 ${
              isSelected
                ? "bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-xs border border-[var(--border-medium)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            }`}
            title={opt.description}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function CustomToggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border border-[var(--border-medium)] transition-colors duration-150 focus:outline-none ${
        disabled ? "opacity-30 cursor-not-allowed" : ""
      } ${checked ? "bg-[var(--text-primary)]" : "bg-[var(--bg-tertiary)]"}`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full transition duration-150 ${
          checked
            ? "translate-x-5 bg-[var(--bg-primary)]"
            : "translate-x-0 bg-[var(--text-muted)]"
        }`}
      />
    </button>
  );
}

export function SliderControl({
  value,
  min,
  max,
  step = 1,
  unit = "",
  showValue = true,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  showValue?: boolean;
  onChange: (val: number) => void;
}) {
  const [localValue, setLocalValue] = React.useState(value);

  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setLocalValue(val);
    onChange(val);
  };

  return (
    <div className="flex items-center gap-3 w-full sm:w-auto">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={localValue}
        onChange={handleChange}
        className="h-1.5 w-36 cursor-pointer appearance-none rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] accent-[var(--text-primary)] transition-all"
      />
      {showValue && (
        <span className="min-w-[42px] text-right font-mono text-[12px] font-bold text-[var(--text-primary)]">
          {localValue}
          {unit}
        </span>
      )}
    </div>
  );
}
