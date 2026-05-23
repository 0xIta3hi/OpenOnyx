import React, { useState, useEffect, useMemo } from 'react';
import { getAPI } from '../utils/api';
import { FileEntry } from '../types';
import { parseFrontmatter, updateFrontmatter, getAllMarkdownFiles } from '../utils/frontmatter';
import { Table, ArrowUpDown, Plus } from 'lucide-react';

interface DatabaseViewProps {
  folderNode: FileEntry;
  onOpenFile: (path: string) => void;
}

export const DatabaseView: React.FC<DatabaseViewProps> = ({ folderNode, onOpenFile }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>(['name']);
  const [isLoading, setIsLoading] = useState(true);

  // Sorting state
  const [sortCol, setSortCol] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setIsLoading(true);
      const api = getAPI();
      const files = getAllMarkdownFiles(folderNode);
      
      const parsedRows: any[] = [];
      const allKeys = new Set<string>();
      
      for (const file of files) {
        const content = await api.readFile(file.path);
        const { properties } = parseFrontmatter(content);
        
        const rowData: any = { 
          _path: file.path, 
          name: file.name.replace('.md', ''),
          _rawContent: content
        };
        
        for (const prop of properties) {
          rowData[prop.key] = prop.value;
          allKeys.add(prop.key);
        }
        
        parsedRows.push(rowData);
      }
      
      if (isMounted) {
        setRows(parsedRows);
        setColumns(['name', ...Array.from(allKeys)]);
        setIsLoading(false);
      }
    }

    loadData();
    return () => { isMounted = false; };
  }, [folderNode]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      let valA = a[sortCol];
      let valB = b[sortCol];
      
      if (valA === undefined) valA = '';
      if (valB === undefined) valB = '';
      
      if (typeof valA === 'string' && typeof valB === 'string') {
        const cmp = valA.localeCompare(valB);
        return sortDir === 'asc' ? cmp : -cmp;
      }
      
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [rows, sortCol, sortDir]);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const handleCellEdit = async (path: string, key: string, newValue: string) => {
    // Optimistic UI update
    setRows(prev => prev.map(r => r._path === path ? { ...r, [key]: newValue } : r));

    const row = rows.find(r => r._path === path);
    if (!row) return;

    const updatedContent = updateFrontmatter(row._rawContent, { [key]: newValue });
    const api = getAPI();
    await api.writeFile(path, updatedContent);

    // Update raw content in state so next edit works cleanly
    setRows(prev => prev.map(r => r._path === path ? { ...r, _rawContent: updatedContent } : r));
  };

  if (isLoading) {
    return <div className="p-8 text-text-muted flex items-center gap-2">
       <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-text-muted"></span> Loading Database...
    </div>;
  }

  return (
    <div className="database-view-container">
      <div className="database-view-content">
        <div className="database-header">
          <Table size={28} className="database-header-icon" />
          <h1 className="database-title">{folderNode.name}</h1>
        </div>

        <div className="database-view-tabs">
          <div className="database-tab">
            <Table size={16} />
            Table
          </div>
        </div>

        <div className="database-table-wrapper">
          <div className="overflow-x-auto">
            <table className="database-table">
              <thead>
                <tr>
                  {columns.map(col => (
                    <th 
                      key={col} 
                      className="database-th group"
                      onClick={() => handleSort(col)}
                    >
                      <div className="database-th-inner">
                        {col === 'name' ? (
                          <span className="database-icon-label">Aa</span>
                        ) : (
                          <span className="database-icon-label opacity-70">≡</span>
                        )}
                        <span>{col}</span>
                        {sortCol === col && <ArrowUpDown size={12} className="database-sort-icon" />}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map(row => (
                  <tr key={row._path} className="database-tr group">
                    {columns.map(col => (
                      <td key={col} className="database-td">
                        {col === 'name' ? (
                          <span 
                            className="database-cell-name font-medium"
                            onClick={() => onOpenFile(row._path)}
                          >
                            {row[col]}
                          </span>
                        ) : (
                          <input
                            type="text"
                            className="database-cell-input"
                            value={row[col] !== undefined ? (Array.isArray(row[col]) ? row[col].join(", ") : row[col]) : ''}
                            placeholder=""
                            onChange={(e) => {
                              const val = e.target.value;
                              setRows(prev => prev.map(r => r._path === row._path ? { ...r, [col]: val } : r));
                            }}
                            onBlur={(e) => handleCellEdit(row._path, col, e.target.value)}
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                {sortedRows.length === 0 && (
                  <tr>
                    <td colSpan={columns.length} className="database-empty-row">
                      No files with frontmatter found.
                    </td>
                  </tr>
                )}
                <tr className="database-new-row group">
                   <td colSpan={columns.length}>
                       <div className="database-new-row-content">
                         <Plus size={16} /> New
                       </div>
                   </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="database-footer">
          {sortedRows.length} {sortedRows.length === 1 ? 'item' : 'items'}
        </div>
      </div>
    </div>
  );
};
