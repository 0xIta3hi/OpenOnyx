/**
 * Properties Panel - Frontmatter/Metadata Editor
 * 
 * Displays and allows editing of YAML frontmatter properties.
 * Supports common property types: text, list, date, tags.
 */

import React, { useMemo, useState, useCallback } from 'react';
import { Settings, Plus, Trash2, Calendar, Tag, FileText, List } from 'lucide-react';

interface PropertiesPanelProps {
  content: string;
  onContentChange: (content: string) => void;
  visible: boolean;
}

interface Property {
  key: string;
  value: string | string[];
  type: 'text' | 'list' | 'date' | 'tags';
}

// Parse YAML frontmatter
function parseFrontmatter(content: string): { properties: Property[]; bodyStart: number } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { properties: [], bodyStart: 0 };
  }

  const yaml = match[1];
  const bodyStart = match[0].length;
  const properties: Property[] = [];

  // Simple YAML parser for common cases
  const lines = yaml.split('\n');
  let currentKey = '';
  let currentList: string[] = [];
  let inList = false;

  for (const line of lines) {
    // List item
    if (inList && line.match(/^\s+-\s+(.+)/)) {
      const itemMatch = line.match(/^\s+-\s+(.+)/);
      if (itemMatch) {
        currentList.push(itemMatch[1].trim());
      }
      continue;
    }

    // If we were in a list, save it
    if (inList && currentKey) {
      properties.push({
        key: currentKey,
        value: currentList,
        type: currentKey === 'tags' ? 'tags' : 'list',
      });
      inList = false;
      currentList = [];
    }

    // Key-value pair
    const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const value = kvMatch[2].trim();

      if (!value) {
        // Could be start of a list
        inList = true;
        currentList = [];
      } else if (value.startsWith('[') && value.endsWith(']')) {
        // Inline array
        const items = value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
        properties.push({
          key: currentKey,
          value: items,
          type: currentKey === 'tags' ? 'tags' : 'list',
        });
      } else {
        // Detect type
        let type: Property['type'] = 'text';
        if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
          type = 'date';
        }
        properties.push({
          key: currentKey,
          value: value.replace(/^["']|["']$/g, ''),
          type,
        });
      }
    }
  }

  // Handle trailing list
  if (inList && currentKey) {
    properties.push({
      key: currentKey,
      value: currentList,
      type: currentKey === 'tags' ? 'tags' : 'list',
    });
  }

  return { properties, bodyStart };
}

// Serialize properties back to YAML frontmatter
function serializeFrontmatter(properties: Property[]): string {
  if (properties.length === 0) return '';

  let yaml = '---\n';
  for (const prop of properties) {
    if (Array.isArray(prop.value)) {
      if (prop.value.length === 0) {
        yaml += `${prop.key}: []\n`;
      } else if (prop.value.length <= 3 && prop.value.every(v => !v.includes(','))) {
        // Inline array for short lists
        yaml += `${prop.key}: [${prop.value.join(', ')}]\n`;
      } else {
        // Multi-line list
        yaml += `${prop.key}:\n`;
        for (const item of prop.value) {
          yaml += `  - ${item}\n`;
        }
      }
    } else {
      yaml += `${prop.key}: ${prop.value}\n`;
    }
  }
  yaml += '---\n';
  return yaml;
}

export function PropertiesPanel({ content, onContentChange, visible }: PropertiesPanelProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [newKey, setNewKey] = useState('');
  const [showAddProperty, setShowAddProperty] = useState(false);

  const { properties, bodyStart } = useMemo(() => parseFrontmatter(content), [content]);
  const body = content.slice(bodyStart);

  const updateProperty = useCallback((key: string, value: string | string[]) => {
    const newProps = properties.map(p => 
      p.key === key ? { ...p, value } : p
    );
    const newFrontmatter = serializeFrontmatter(newProps);
    onContentChange(newFrontmatter + body);
  }, [properties, body, onContentChange]);

  const deleteProperty = useCallback((key: string) => {
    const newProps = properties.filter(p => p.key !== key);
    const newFrontmatter = serializeFrontmatter(newProps);
    onContentChange(newFrontmatter + body);
  }, [properties, body, onContentChange]);

  const addProperty = useCallback((key: string, type: Property['type']) => {
    if (!key.trim()) return;
    
    const newProp: Property = {
      key: key.trim(),
      value: type === 'list' || type === 'tags' ? [] : '',
      type,
    };
    const newProps = [...properties, newProp];
    const newFrontmatter = serializeFrontmatter(newProps);
    onContentChange(newFrontmatter + body);
    setNewKey('');
    setShowAddProperty(false);
  }, [properties, body, onContentChange]);

  if (!visible) return null;

  return (
    <div className="properties-panel">
      <div className="properties-header">
        <Settings size={14} strokeWidth={2} />
        <span>Properties</span>
        <button 
          className="properties-add-btn"
          onClick={() => setShowAddProperty(!showAddProperty)}
          title="Add property"
        >
          <Plus size={14} />
        </button>
      </div>

      {showAddProperty && (
        <div className="property-add-form">
          <input
            type="text"
            placeholder="Property name"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            className="property-add-input"
          />
          <div className="property-type-buttons">
            <button onClick={() => addProperty(newKey, 'text')} title="Text">
              <FileText size={12} />
            </button>
            <button onClick={() => addProperty(newKey, 'date')} title="Date">
              <Calendar size={12} />
            </button>
            <button onClick={() => addProperty(newKey, 'list')} title="List">
              <List size={12} />
            </button>
            <button onClick={() => addProperty(newKey, 'tags')} title="Tags">
              <Tag size={12} />
            </button>
          </div>
        </div>
      )}

      <div className="properties-list">
        {properties.length === 0 ? (
          <div className="properties-empty">
            No properties defined.
            <br />
            <small>Add YAML frontmatter to define properties.</small>
          </div>
        ) : (
          properties.map(prop => (
            <div key={prop.key} className="property-item">
              <div className="property-key">
                {prop.type === 'date' && <Calendar size={12} className="property-type-icon" />}
                {prop.type === 'tags' && <Tag size={12} className="property-type-icon" />}
                {prop.type === 'list' && <List size={12} className="property-type-icon" />}
                {prop.type === 'text' && <FileText size={12} className="property-type-icon" />}
                <span>{prop.key}</span>
              </div>
              <div className="property-value">
                {Array.isArray(prop.value) ? (
                  <div className="property-tags">
                    {prop.value.map((v, i) => (
                      <span key={i} className="property-tag">
                        {v}
                        <button 
                          className="property-tag-remove"
                          onClick={() => {
                            const arr = prop.value as string[];
                            updateProperty(prop.key, arr.filter((_: string, j: number) => j !== i));
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <input
                      type="text"
                      className="property-tag-input"
                      placeholder="Add..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.currentTarget.value) {
                          updateProperty(prop.key, [...prop.value as string[], e.currentTarget.value]);
                          e.currentTarget.value = '';
                        }
                      }}
                    />
                  </div>
                ) : prop.type === 'date' ? (
                  <input
                    type="date"
                    value={prop.value as string}
                    onChange={(e) => updateProperty(prop.key, e.target.value)}
                    className="property-input date"
                  />
                ) : (
                  <input
                    type="text"
                    value={prop.value as string}
                    onChange={(e) => updateProperty(prop.key, e.target.value)}
                    className="property-input"
                  />
                )}
              </div>
              <button 
                className="property-delete"
                onClick={() => deleteProperty(prop.key)}
                title="Delete property"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
