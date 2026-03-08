import React, { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, Search, Filter } from 'lucide-react';
import { clsx } from 'clsx';

export interface ColumnDef<T> {
    header: string;
    accessorKey: keyof T | string;
    cell?: (item: T) => React.ReactNode;
    sortable?: boolean;
    filterable?: boolean;
    filterType?: 'text' | 'select' | 'number';
    filterOptions?: { label: string; value: string | number }[]; // For select filters
}

interface DataTableProps<T> {
    data: T[];
    columns: ColumnDef<T>[];
    keyField: keyof T;
    onRowSelected?: (selectedIds: string[]) => void;
    actions?: (item: T) => React.ReactNode;
    globalSearch?: boolean;
}

export function DataTable<T extends Record<string, any>>({
    data,
    columns,
    keyField,
    onRowSelected,
    actions,
    globalSearch = true
}: DataTableProps<T>) {
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [globalFilter, setGlobalFilter] = useState('');
    const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
    const [showFilters, setShowFilters] = useState(false);

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedRows(new Set(filteredAndSortedData.map(item => String(item[keyField]))));
        } else {
            setSelectedRows(new Set());
        }
    };

    const handleSelectRow = (id: string) => {
        const newSelected = new Set(selectedRows);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedRows(newSelected);
        onRowSelected?.(Array.from(newSelected));
    };

    const handleColumnFilterChange = (key: string, value: string) => {
        setColumnFilters(prev => ({ ...prev, [key]: value }));
    };

    const filteredAndSortedData = useMemo(() => {
        let result = [...data];

        // Global Search
        if (globalFilter) {
            const lowerFilter = globalFilter.toLowerCase();
            result = result.filter(item =>
                Object.values(item).some(val =>
                    String(val).toLowerCase().includes(lowerFilter)
                )
            );
        }

        // Column Filters
        Object.entries(columnFilters).forEach(([key, filterValue]) => {
            if (filterValue) {
                const lowerFilter = filterValue.toLowerCase();
                const colDef = columns.find(c => c.accessorKey === key);

                result = result.filter(item => {
                    const cellValue = String(item[key] || '');
                    if (colDef?.filterType === 'select') {
                        return cellValue === filterValue;
                    }
                    return cellValue.toLowerCase().includes(lowerFilter);
                });
            }
        });

        // Sorting
        if (sortConfig !== null) {
            result.sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];

                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [data, sortConfig, globalFilter, columnFilters, columns]);

    return (
        <div className="flex flex-col h-full bg-transparent overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3 flex-1">
                    {globalSearch && (
                        <div className="relative max-w-sm flex-1 group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors" size={14} />
                            <input
                                type="text"
                                placeholder="Search records..."
                                value={globalFilter}
                                onChange={e => setGlobalFilter(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 text-[13px] bg-slate-100 dark:bg-slate-800/40 border-0 rounded-lg outline-none ring-1 ring-inset ring-slate-200 dark:ring-slate-700/50 focus:ring-2 focus:ring-primary transition-all text-slate-800 dark:text-slate-200"
                            />
                        </div>
                    )}
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={clsx(
                            "p-2 rounded-lg border transition-all flex items-center gap-2 text-xs font-bold uppercase tracking-wider",
                            showFilters 
                                ? "bg-primary text-white border-primary" 
                                : "utilitarian-border bg-white dark:bg-slate-800/40 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
                        )}
                    >
                        <Filter size={14} />
                        Filter
                    </button>
                    {Object.values(columnFilters).some(v => v !== '') && (
                        <button 
                            onClick={() => setColumnFilters({})}
                            className="text-[10px] font-bold uppercase tracking-widest text-primary hover:underline"
                        >
                            Clear All
                        </button>
                    )}
                </div>
                <div className="shrink-0 flex items-center gap-4">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                        {filteredAndSortedData.length} records found
                    </span>
                </div>
            </div>

            {/* Table Container */}
            <div className="flex-1 overflow-auto custom-scrollbar border utilitarian-border rounded-xl bg-white dark:bg-transparent">
                <table className="w-full text-left border-collapse table-fixed">
                    <thead>
                        <tr className="border-b utilitarian-border bg-slate-50/50 dark:bg-slate-800/20 backdrop-blur-sm sticky top-0 z-10">
                            {onRowSelected && (
                                <th className="p-4 w-12 text-center">
                                    <input
                                        type="checkbox"
                                        checked={selectedRows.size === filteredAndSortedData.length && filteredAndSortedData.length > 0}
                                        onChange={handleSelectAll}
                                        className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-primary focus:ring-primary bg-white dark:bg-slate-900"
                                    />
                                </th>
                            )}
                            {columns.map(col => (
                                <th
                                    key={String(col.accessorKey)}
                                    className="p-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest"
                                >
                                    <div className="flex flex-col gap-2">
                                        <div
                                            className={clsx(
                                                "flex items-center gap-2 group/header select-none",
                                                col.sortable && "cursor-pointer hover:text-primary"
                                            )}
                                            onClick={() => col.sortable && handleSort(String(col.accessorKey))}
                                        >
                                            {col.header}
                                            {col.sortable && (
                                                <div className="flex flex-col text-[10px] opacity-0 group-hover/header:opacity-100 transition-opacity">
                                                    <ChevronUp className={clsx("w-3 h-3", sortConfig?.key === col.accessorKey && sortConfig?.direction === 'asc' ? 'text-primary opacity-100' : 'text-slate-400')} />
                                                    <ChevronDown className={clsx("w-3 h-3 -mt-1.5", sortConfig?.key === col.accessorKey && sortConfig?.direction === 'desc' ? 'text-primary opacity-100' : 'text-slate-400')} />
                                                </div>
                                            )}
                                        </div>
                                        
                                        {showFilters && col.filterable && (
                                            <div className="mt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                                {col.filterType === 'select' && col.filterOptions ? (
                                                    <select
                                                        className="w-full text-[10px] font-bold p-1 bg-white dark:bg-slate-900 border utilitarian-border rounded outline-none focus:ring-1 focus:ring-primary text-slate-600 dark:text-slate-300"
                                                        value={columnFilters[String(col.accessorKey)] || ''}
                                                        onChange={e => handleColumnFilterChange(String(col.accessorKey), e.target.value)}
                                                    >
                                                        <option value="">ALL</option>
                                                        {col.filterOptions.map(opt => (
                                                            <option key={opt.value} value={opt.value}>{opt.label.toUpperCase()}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <input
                                                        type="text"
                                                        placeholder="SEARCH..."
                                                        className="w-full text-[10px] font-bold p-1 bg-white dark:bg-slate-900 border utilitarian-border rounded outline-none focus:ring-1 focus:ring-primary text-slate-600 dark:text-slate-300 placeholder:opacity-50"
                                                        value={columnFilters[String(col.accessorKey)] || ''}
                                                        onChange={e => handleColumnFilterChange(String(col.accessorKey), e.target.value)}
                                                    />
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </th>
                            ))}
                            {actions && (
                                <th className="p-4 w-28 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest text-right">
                                    Actions
                                </th>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y utilitarian-border">
                        {filteredAndSortedData.length === 0 ? (
                            <tr>
                                <td colSpan={(columns.length + (onRowSelected ? 1 : 0) + (actions ? 1 : 0))} className="p-12 text-center text-slate-400 italic text-[13px]">
                                    No records found matching your workspace criteria.
                                </td>
                            </tr>
                        ) : (
                            filteredAndSortedData.map((row, idx) => {
                                const id = String(row[keyField]);
                                const isSelected = selectedRows.has(id);
                                return (
                                    <tr
                                        key={id}
                                        style={{ animationDelay: `${idx * 20}ms` }}
                                        className={clsx(
                                            "group/row hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-all animate-in fade-in slide-in-from-left-2",
                                            isSelected ? 'bg-primary/5 dark:bg-primary/10' : ''
                                        )}
                                    >
                                        {onRowSelected && (
                                            <td className="p-4 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => handleSelectRow(id)}
                                                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-primary focus:ring-primary bg-white dark:bg-slate-900"
                                                />
                                            </td>
                                        )}
                                        {columns.map(col => (
                                            <td key={String(col.accessorKey)} className="p-4 text-[13px] font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap overflow-hidden text-ellipsis" title={String(row[col.accessorKey])}>
                                                {col.cell ? col.cell(row) : (
                                                    <span className="font-mono text-xs opacity-75">{String(row[col.accessorKey] || '')}</span>
                                                )}
                                            </td>
                                        ))}
                                        {actions && (
                                            <td className="p-4 text-right">
                                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                                    {actions(row)}
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>
            {/* Footer shadow to indicate scroll */}
            <div className="h-4 bg-gradient-to-t from-background-light dark:from-background-dark to-transparent pointer-events-none mt-[-16px]" />
        </div>
    );
}
