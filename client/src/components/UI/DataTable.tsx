import React, { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, Search } from 'lucide-react';

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
        <div className="flex flex-col h-full bg-white dark:bg-[#1a1e2e] rounded-lg shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            {/* Toolbar */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-[#1a1e2e]">
                {globalSearch && (
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="Buscar en todos los campos..."
                            value={globalFilter}
                            onChange={e => setGlobalFilter(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 text-sm bg-white dark:bg-[#0f111a] border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1337ec] text-slate-800 dark:text-slate-200"
                        />
                    </div>
                )}
                <div>
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                        {filteredAndSortedData.length} registros
                    </span>
                </div>
            </div>

            {/* Table Container */}
            <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-slate-50 dark:bg-[#131520] shadow-sm z-10">
                        {/* Headers */}
                        <tr>
                            {onRowSelected && (
                                <th className="p-3 w-10 border-b border-slate-200 dark:border-slate-800">
                                    <input
                                        type="checkbox"
                                        checked={selectedRows.size === filteredAndSortedData.length && filteredAndSortedData.length > 0}
                                        onChange={handleSelectAll}
                                        className="rounded border-slate-300 text-[#1337ec] focus:ring-[#1337ec] bg-white dark:bg-[#0f111a]"
                                    />
                                </th>
                            )}
                            {columns.map(col => (
                                <th
                                    key={String(col.accessorKey)}
                                    className="p-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800"
                                >
                                    <div className="flex flex-col gap-2">
                                        <div
                                            className={`flex items-center gap-1 ${col.sortable ? 'cursor-pointer hover:text-slate-800 dark:hover:text-slate-200 select-none' : ''}`}
                                            onClick={() => col.sortable && handleSort(String(col.accessorKey))}
                                        >
                                            {col.header}
                                            {col.sortable && (
                                                <span className="inline-flex flex-col text-[10px] leading-none text-slate-400">
                                                    <ChevronUp className={`w-3 h-3 ${sortConfig?.key === col.accessorKey && sortConfig?.direction === 'asc' ? 'text-[#1337ec]' : ''}`} />
                                                    <ChevronDown className={`w-3 h-3 -mt-1 ${sortConfig?.key === col.accessorKey && sortConfig?.direction === 'desc' ? 'text-[#1337ec]' : ''}`} />
                                                </span>
                                            )}
                                        </div>
                                        {/* Column Filters inline */}
                                        {col.filterable && (
                                            <div onClick={e => e.stopPropagation()}>
                                                {col.filterType === 'select' && col.filterOptions ? (
                                                    <select
                                                        className="w-full text-xs p-1 bg-white dark:bg-[#0f111a] border border-slate-300 dark:border-slate-700 rounded text-slate-600 dark:text-slate-300 focus:outline-none focus:border-[#1337ec]"
                                                        value={columnFilters[String(col.accessorKey)] || ''}
                                                        onChange={e => handleColumnFilterChange(String(col.accessorKey), e.target.value)}
                                                    >
                                                        <option value="">Todos</option>
                                                        {col.filterOptions.map(opt => (
                                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <input
                                                        type="text"
                                                        placeholder="Filtrar..."
                                                        className="w-full text-xs p-1 bg-white dark:bg-[#0f111a] border border-slate-300 dark:border-slate-700 rounded text-slate-600 dark:text-slate-300 focus:outline-none focus:border-[#1337ec]"
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
                                <th className="p-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 text-right">
                                    Acciones
                                </th>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-[#1a1e2e]">
                        {filteredAndSortedData.length === 0 ? (
                            <tr>
                                <td colSpan={(columns.length + (onRowSelected ? 1 : 0) + (actions ? 1 : 0))} className="p-8 text-center text-slate-500 dark:text-slate-400">
                                    No se encontraron resultados
                                </td>
                            </tr>
                        ) : (
                            filteredAndSortedData.map((row) => {
                                const id = String(row[keyField]);
                                const isSelected = selectedRows.has(id);
                                return (
                                    <tr
                                        key={id}
                                        className={`hover:bg-slate-50 dark:hover:bg-white/5 transition-colors ${isSelected ? 'bg-blue-50/50 dark:bg-[#1337ec]/10' : ''}`}
                                    >
                                        {onRowSelected && (
                                            <td className="p-3 border-b border-slate-100 dark:border-slate-800/50">
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => handleSelectRow(id)}
                                                    className="rounded border-slate-300 text-[#1337ec] focus:ring-[#1337ec] bg-white dark:bg-[#0f111a]"
                                                />
                                            </td>
                                        )}
                                        {columns.map(col => (
                                            <td key={String(col.accessorKey)} className="p-3 text-sm text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800/50 whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px]" title={String(row[col.accessorKey])}>
                                                {col.cell ? col.cell(row) : String(row[col.accessorKey] || '')}
                                            </td>
                                        ))}
                                        {actions && (
                                            <td className="p-3 border-b border-slate-100 dark:border-slate-800/50 text-right">
                                                {actions(row)}
                                            </td>
                                        )}
                                    </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

