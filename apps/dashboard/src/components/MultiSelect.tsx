import { useEffect, useRef, useState } from "react";

interface Props {
  label: string;
  options: { value: string; count: number }[];
  selected: string[];
  onChange: (next: string[]) => void;
}

export function MultiSelect({ label, options, selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-[11px] transition ${
          selected.length
            ? "border-amber-300/50 bg-amber-300/10 text-amber-100"
            : "border-white/12 bg-black/30 text-[#faf6e8]/75 hover:border-white/25"
        }`}
      >
        {label}
        {selected.length > 0 && (
          <span className="rounded-full bg-amber-300 px-1.5 text-[10px] font-bold text-[#141218]">{selected.length}</span>
        )}
        <span aria-hidden="true" className="opacity-60">
          ▾
        </span>
      </button>
      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="scroll-thin absolute left-0 z-40 mt-1.5 max-h-72 w-64 overflow-y-auto rounded-xl border border-white/12 bg-[#141218]/95 p-1.5 shadow-2xl backdrop-blur-xl"
        >
          <div className="mb-1 flex items-center justify-between border-b border-white/10 px-2 py-1 font-mono text-[10px] text-[#faf6e8]/50">
            <span>{options.length} options</span>
            {selected.length > 0 && (
              <button type="button" onClick={() => onChange([])} className="text-amber-300 hover:text-amber-200">
                Clear
              </button>
            )}
          </div>
          {options.map((opt) => {
            const on = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => toggle(opt.value)}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                  on ? "bg-amber-300/15 text-amber-100" : "text-[#faf6e8]/80 hover:bg-white/5"
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <span
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[9px] ${
                      on ? "border-amber-300 bg-amber-300 text-[#141218]" : "border-white/25"
                    }`}
                  >
                    {on ? "✓" : ""}
                  </span>
                  <span className="truncate">{opt.value}</span>
                </span>
                <span className="ml-2 font-mono text-[10px] text-[#faf6e8]/45 tabular-nums">{opt.count}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

