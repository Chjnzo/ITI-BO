"use client";

import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';

export interface ComboboxItem {
  id: string;
  label: string;
  sublabel?: string;
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
  searchPlaceholder = 'Cerca...',
  emptyMessage = 'Nessun risultato.',
  onSearch,
  className,
  disabled,
}: ComboboxProps) => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  const selected = items.find(i => i.id === value);

  const visible = onSearch
    ? items
    : items.filter(i =>
        i.label.toLowerCase().includes(query.toLowerCase()) ||
        (i.sublabel ?? '').toLowerCase().includes(query.toLowerCase())
      );

  const handleSearch = (q: string) => {
    setQuery(q);
    onSearch?.(q);
  };

  const handleSelect = (id: string) => {
    onSelect(id === value ? '' : id);
    setOpen(false);
    setQuery('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-12 w-full items-center justify-between rounded-xl border border-gray-200 bg-slate-50/50 px-3 py-2 text-sm',
            'hover:bg-slate-100 transition-colors',
            'disabled:cursor-not-allowed disabled:opacity-50',
            !selected && 'text-gray-400',
            className,
          )}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-gray-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 rounded-xl border-gray-200 shadow-lg"
        style={{ width: 'var(--radix-popover-trigger-width)' }}
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={handleSearch}
            className="h-10 text-sm"
          />
          <CommandList>
            <CommandEmpty className="py-3 text-center text-xs text-gray-400">
              {emptyMessage}
            </CommandEmpty>
            <CommandGroup>
              {visible.map(item => (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  onSelect={() => handleSelect(item.id)}
                  className="flex items-start gap-2 px-3 py-2 cursor-pointer"
                >
                  <Check
                    className={cn(
                      'mt-0.5 h-4 w-4 shrink-0 text-[#94b0ab]',
                      value === item.id ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="flex flex-col">
                    <span className="text-sm font-medium text-gray-800">{item.label}</span>
                    {item.sublabel && (
                      <span className="text-xs text-gray-400">{item.sublabel}</span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
