"use client";

import * as React from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ComboboxItem {
  id: string;
  label: string;
  sublabel?: string;
  image?: string;
}

interface ComboboxProps {
  items: ComboboxItem[];
  value: string;
  onSelect: (id: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  /** If provided, filtering is async — caller controls `items`. Otherwise items are filtered client-side. */
  onSearch?: (query: string) => void;
  className?: string;
  disabled?: boolean;
}

export const Combobox = ({
  items, value, onSelect,
  placeholder = 'Seleziona...',
  emptyMessage = 'Nessun risultato.',
  onSearch,
  className,
  disabled,
}: ComboboxProps) => {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selected = items.find(i => i.id === value);

  // Sync input display: show selected label when closed/idle, allow typing when open
  React.useEffect(() => {
    if (!open) {
      setInputValue(selected?.label ?? '');
    }
  }, [open, selected]);

  // When value changes externally (e.g. modal reset), sync input
  React.useEffect(() => {
    if (!open) {
      setInputValue(selected?.label ?? '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const visible = onSearch
    ? items
    : items.filter(i => {
        const q = inputValue;
        if (!q) return true;
        const labelMatch = i.label.toLowerCase().includes(q.toLowerCase());
        const sublabelMatch = (i.sublabel ?? '').toLowerCase().includes(q.toLowerCase());
        // Phone normalisation: strip non-digits and compare sequences
        const qDigits = q.replace(/\D/g, '');
        const phoneMatch =
          qDigits.length >= 4 &&
          (i.sublabel ?? '').replace(/\D/g, '').includes(qDigits);
        return labelMatch || sublabelMatch || phoneMatch;
      });

  const handleFocus = () => {
    setOpen(true);
    // Clear input so user can start searching from scratch
    setInputValue('');
    if (onSearch) onSearch('');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setInputValue(q);
    setOpen(true);
    onSearch?.(q);
  };

  const handleSelect = (id: string) => {
    onSelect(id === value ? '' : id);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect('');
    setInputValue('');
    setOpen(false);
    inputRef.current?.focus();
  };

  // Close on outside click
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close on Escape
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn(
            'flex h-12 w-full rounded-xl border border-gray-200 bg-slate-50/50 px-3 py-2 pr-8 text-sm',
            'placeholder:text-gray-400 outline-none',
            'focus:border-[#94b0ab] focus:ring-2 focus:ring-[#94b0ab]/20 transition-all',
            'disabled:cursor-not-allowed disabled:opacity-50',
            selected && !open && 'text-gray-800',
          )}
        />
        {selected && !open && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
          <ul className="max-h-56 overflow-y-auto py-1">
            {visible.length === 0 ? (
              <li className="px-3 py-3 text-xs text-center text-gray-400">{emptyMessage}</li>
            ) : (
              visible.map(item => (
                <li
                  key={item.id}
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(item.id); }}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 cursor-pointer select-none',
                    'hover:bg-slate-50 transition-colors',
                    value === item.id && 'bg-[#94b0ab]/10',
                  )}
                >
                  <Check
                    size={14}
                    className={cn(
                      'shrink-0 text-[#94b0ab]',
                      value === item.id ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {item.image && (
                    <img
                      src={item.image}
                      alt=""
                      className="w-10 h-10 rounded-lg object-cover shrink-0 bg-gray-100"
                    />
                  )}
                  <span className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-gray-800 truncate">{item.label}</span>
                    {item.sublabel && (
                      <span className="text-xs text-gray-400 truncate">{item.sublabel}</span>
                    )}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
