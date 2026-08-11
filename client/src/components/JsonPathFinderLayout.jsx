import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Play,
  Loader2,
  Copy,
  Check,
  ChevronRight,
  ChevronDown,
  Search,
  Filter,
  HelpCircle,
  X,
  Code2,
} from 'lucide-react';

function TreeNode({ node, depth, onSelect, expandedNodes, toggleNode }) {
  const isExpanded = expandedNodes.has(node.path);
  const hasChildren = node.children && node.children.length > 0;
  const indent = depth * 16;

  const typeColors = {
    string: 'text-green-600',
    number: 'text-blue-600',
    boolean: 'text-purple-600',
    null: 'text-red-400',
    object: 'text-gray-500',
    array: 'text-amber-600',
  };

  const typeColor = typeColors[node.type] || 'text-gray-500';

  return (
    <div>
      <div
        className="group flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 hover:bg-blue-50"
        style={{ paddingLeft: `${indent + 4}px` }}
        onClick={() => {
          if (hasChildren) toggleNode(node.path);
          onSelect(node.path);
        }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); toggleNode(node.path); }}
            className="shrink-0 p-0.5 text-gray-400 hover:text-gray-600"
          >
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="inline-block w-4 shrink-0" />
        )}
        <span className="truncate font-mono text-xs text-gray-800">{node.key}</span>
        <span className={`ml-1 shrink-0 font-mono text-xs ${typeColor}`}>
          {node.preview}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(node.path); }}
          className="ml-auto hidden shrink-0 rounded p-0.5 text-gray-400 hover:text-blue-600 group-hover:block"
          title="Use this path"
        >
          <Copy size={11} />
        </button>
      </div>
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child, i) => (
            <TreeNode
              key={child.path || i}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
              expandedNodes={expandedNodes}
              toggleNode={toggleNode}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StreamHelp({ onClose }) {
  const ops = [
    { syntax: 'filter(.field > value)', desc: 'Keep items matching condition' },
    { syntax: 'map(.field)', desc: 'Extract a field from each item' },
    { syntax: 'find(.field == value)', desc: 'Get first matching item' },
    { syntax: 'count()', desc: 'Count total items' },
    { syntax: 'distinct(.field)', desc: 'Get unique values' },
    { syntax: 'sort(.field)', desc: 'Sort ascending by field' },
    { syntax: 'sort(.field, desc)', desc: 'Sort descending' },
    { syntax: 'limit(n)', desc: 'Take first n items' },
    { syntax: 'min(.field)', desc: 'Get minimum value' },
    { syntax: 'max(.field)', desc: 'Get maximum value' },
    { syntax: 'sum(.field)', desc: 'Sum all values' },
    { syntax: 'avg(.field)', desc: 'Calculate average' },
  ];

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-blue-800">Stream Operations Reference</h4>
        <button onClick={onClose} className="text-blue-400 hover:text-blue-600"><X size={14} /></button>
      </div>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {ops.map((op) => (
          <div key={op.syntax} className="flex items-baseline gap-2 text-xs">
            <code className="rounded bg-blue-100 px-1.5 py-0.5 font-mono text-blue-700">{op.syntax}</code>
            <span className="text-blue-600">{op.desc}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-blue-600">
        <strong>Chain operations:</strong> <code className="rounded bg-blue-100 px-1 py-0.5 font-mono">filter(.price &gt; 10).map(.title).sort()</code>
      </p>
      <p className="mt-1 text-xs text-blue-600">
        <strong>Operators:</strong> ==, !=, &gt;, &lt;, &gt;=, &lt;=, contains, startsWith, endsWith
      </p>
    </div>
  );
}

function parseFilterOps(expression) {
  const ops = [];
  const opRegex = /(?:^|\.)(filter|map|find|count|distinct|sort|limit|min|max|sum|avg)\(([^)]*)\)/g;
  let m;
  while ((m = opRegex.exec(expression)) !== null) {
    ops.push({ name: m[1], arg: m[2].trim() });
  }
  return ops;
}

function parseConditionParts(condStr) {
  const match = condStr.trim().match(/^\.([a-zA-Z_$][a-zA-Z0-9_$.]*)\s*(==|!=|>=|<=|>|<|contains|startsWith|endsWith)\s*(.+)$/);
  if (!match) return null;
  const [, field, operator, rawValue] = match;
  return { field, operator, value: rawValue.trim() };
}

function generateJavaCode(pathExpr, filterExpr, variableName = 'data') {
  const lines = [];
  lines.push('import com.jayway.jsonpath.JsonPath;');
  lines.push('import java.util.List;');
  lines.push('import java.util.stream.Collectors;');
  lines.push('');

  const jsonPath = pathExpr
    ? pathExpr.replace(/^x/, '$').replace(/\[(\d+)\]/g, '[$1]')
    : '$';

  lines.push(`// Extract array from JSON using JsonPath`);
  lines.push(`List<Map<String, Object>> ${variableName} = JsonPath.read(jsonString, "${jsonPath}");`);
  lines.push('');

  if (!filterExpr) return lines.join('\n');

  const ops = parseFilterOps(filterExpr);
  if (ops.length === 0) return lines.join('\n');

  lines.push(`// Stream operations`);
  let streamLines = [`${variableName}.stream()`];

  for (const op of ops) {
    switch (op.name) {
      case 'filter': {
        const cond = parseConditionParts(op.arg);
        if (cond) {
          const javaOp = cond.operator === '==' ? '.equals' : cond.operator;
          const val = cond.value;
          if (cond.operator === 'contains') {
            streamLines.push(`    .filter(item -> ((String) item.get("${cond.field}")).contains(${val}))`);
          } else if (cond.operator === 'startsWith') {
            streamLines.push(`    .filter(item -> ((String) item.get("${cond.field}")).startsWith(${val}))`);
          } else if (cond.operator === 'endsWith') {
            streamLines.push(`    .filter(item -> ((String) item.get("${cond.field}")).endsWith(${val}))`);
          } else if (cond.operator === '==') {
            if (val.startsWith('"') || val.startsWith("'")) {
              streamLines.push(`    .filter(item -> ${val}.equals(item.get("${cond.field}")))`);
            } else {
              streamLines.push(`    .filter(item -> ((Number) item.get("${cond.field}")).doubleValue() == ${val})`);
            }
          } else if (cond.operator === '!=') {
            if (val.startsWith('"') || val.startsWith("'")) {
              streamLines.push(`    .filter(item -> !${val}.equals(item.get("${cond.field}")))`);
            } else {
              streamLines.push(`    .filter(item -> ((Number) item.get("${cond.field}")).doubleValue() != ${val})`);
            }
          } else {
            streamLines.push(`    .filter(item -> ((Number) item.get("${cond.field}")).doubleValue() ${cond.operator} ${val})`);
          }
        }
        break;
      }
      case 'map': {
        const field = op.arg.replace(/^\./, '');
        streamLines.push(`    .map(item -> item.get("${field}"))`);
        break;
      }
      case 'find': {
        const cond = parseConditionParts(op.arg);
        if (cond) {
          if (['>', '<', '>=', '<='].includes(cond.operator)) {
            streamLines.push(`    .filter(item -> ((Number) item.get("${cond.field}")).doubleValue() ${cond.operator} ${cond.value})`);
          } else {
            streamLines.push(`    .filter(item -> ${cond.value}.equals(item.get("${cond.field}")))`);
          }
          streamLines.push(`    .findFirst()`);
          streamLines.push(`    .orElse(null);`);
          lines.push(`var result = ${streamLines.join('\n')}`);
          return lines.join('\n');
        }
        break;
      }
      case 'sort': {
        const parts = op.arg.split(',').map(s => s.trim());
        const field = parts[0] ? parts[0].replace(/^\./, '') : '';
        const desc = parts[1] === 'desc';
        if (field) {
          const comparator = `Comparator.comparing(item -> (Comparable) item.get("${field}"))`;
          streamLines.push(`    .sorted(${comparator}${desc ? '.reversed()' : ''})`);
        } else {
          streamLines.push(`    .sorted(${desc ? 'Comparator.reverseOrder()' : ''})`);
        }
        break;
      }
      case 'distinct': {
        const field = op.arg.replace(/^\./, '');
        if (field) {
          streamLines.push(`    .map(item -> item.get("${field}"))`);
        }
        streamLines.push(`    .distinct()`);
        break;
      }
      case 'limit': {
        streamLines.push(`    .limit(${op.arg})`);
        break;
      }
      case 'count': {
        streamLines.push(`    .count();`);
        lines.push(`long result = ${streamLines.join('\n')}`);
        return lines.join('\n');
      }
      case 'min': {
        const field = op.arg.replace(/^\./, '');
        streamLines.push(`    .map(item -> ((Number) item.get("${field}")).doubleValue())`);
        streamLines.push(`    .min(Double::compareTo)`);
        streamLines.push(`    .orElse(null);`);
        lines.push(`var result = ${streamLines.join('\n')}`);
        return lines.join('\n');
      }
      case 'max': {
        const field = op.arg.replace(/^\./, '');
        streamLines.push(`    .map(item -> ((Number) item.get("${field}")).doubleValue())`);
        streamLines.push(`    .max(Double::compareTo)`);
        streamLines.push(`    .orElse(null);`);
        lines.push(`var result = ${streamLines.join('\n')}`);
        return lines.join('\n');
      }
      case 'sum': {
        const field = op.arg.replace(/^\./, '');
        streamLines.push(`    .mapToDouble(item -> ((Number) item.get("${field}")).doubleValue())`);
        streamLines.push(`    .sum();`);
        lines.push(`double result = ${streamLines.join('\n')}`);
        return lines.join('\n');
      }
      case 'avg': {
        const field = op.arg.replace(/^\./, '');
        streamLines.push(`    .mapToDouble(item -> ((Number) item.get("${field}")).doubleValue())`);
        streamLines.push(`    .average()`);
        streamLines.push(`    .orElse(0.0);`);
        lines.push(`double result = ${streamLines.join('\n')}`);
        return lines.join('\n');
      }
    }
  }

  streamLines.push(`    .collect(Collectors.toList());`);
  lines.push(`var result = ${streamLines.join('\n')}`);
  return lines.join('\n');
}

function generateJavaScriptCode(pathExpr, filterExpr, variableName = 'data') {
  const lines = [];

  if (pathExpr) {
    const jsPath = pathExpr.replace(/^x\.?/, '');
    if (jsPath) {
      lines.push(`const ${variableName} = json${jsPath.startsWith('[') ? '' : '.'}${jsPath};`);
    } else {
      lines.push(`const ${variableName} = json;`);
    }
  } else {
    lines.push(`const ${variableName} = json;`);
  }
  lines.push('');

  if (!filterExpr) return lines.join('\n');

  const ops = parseFilterOps(filterExpr);
  if (ops.length === 0) return lines.join('\n');

  let chainLines = [`const result = ${variableName}`];

  for (const op of ops) {
    switch (op.name) {
      case 'filter': {
        const cond = parseConditionParts(op.arg);
        if (cond) {
          const val = cond.value;
          if (cond.operator === 'contains') {
            chainLines.push(`  .filter(item => item.${cond.field}.includes(${val}))`);
          } else if (cond.operator === 'startsWith') {
            chainLines.push(`  .filter(item => item.${cond.field}.startsWith(${val}))`);
          } else if (cond.operator === 'endsWith') {
            chainLines.push(`  .filter(item => item.${cond.field}.endsWith(${val}))`);
          } else {
            chainLines.push(`  .filter(item => item.${cond.field} ${cond.operator === '==' ? '===' : cond.operator} ${val})`);
          }
        }
        break;
      }
      case 'map': {
        const field = op.arg.replace(/^\./, '');
        chainLines.push(`  .map(item => item.${field})`);
        break;
      }
      case 'find': {
        const cond = parseConditionParts(op.arg);
        if (cond) {
          const val = cond.value;
          if (cond.operator === 'contains') {
            chainLines.push(`  .find(item => item.${cond.field}.includes(${val}))`);
          } else {
            chainLines.push(`  .find(item => item.${cond.field} ${cond.operator === '==' ? '===' : cond.operator} ${val})`);
          }
        }
        chainLines.push(';');
        lines.push(chainLines.join('\n'));
        return lines.join('\n');
      }
      case 'sort': {
        const parts = op.arg.split(',').map(s => s.trim());
        const field = parts[0] ? parts[0].replace(/^\./, '') : '';
        const desc = parts[1] === 'desc';
        if (field) {
          chainLines.push(`  .sort((a, b) => ${desc ? 'b' : 'a'}.${field} > ${desc ? 'a' : 'b'}.${field} ? 1 : -1)`);
        } else {
          chainLines.push(`  .sort(${desc ? '(a, b) => b > a ? 1 : -1' : ''})`);
        }
        break;
      }
      case 'distinct': {
        const field = op.arg.replace(/^\./, '');
        if (field) {
          chainLines.push(`  .map(item => item.${field})`);
        }
        chainLines.push(`  .filter((v, i, arr) => arr.indexOf(v) === i)`);
        break;
      }
      case 'limit': {
        chainLines.push(`  .slice(0, ${op.arg})`);
        break;
      }
      case 'count': {
        chainLines.push(`.length;`);
        lines.push(chainLines.join('\n'));
        return lines.join('\n');
      }
      case 'min': {
        const field = op.arg.replace(/^\./, '');
        lines.push(chainLines.join('\n').replace('const result = ', ''));
        lines.push('');
        lines.push(`const result = Math.min(...${variableName}.map(item => item.${field}));`);
        return lines.join('\n');
      }
      case 'max': {
        const field = op.arg.replace(/^\./, '');
        lines.push(chainLines.join('\n').replace('const result = ', ''));
        lines.push('');
        lines.push(`const result = Math.max(...${variableName}.map(item => item.${field}));`);
        return lines.join('\n');
      }
      case 'sum': {
        const field = op.arg.replace(/^\./, '');
        chainLines.push(`  .reduce((sum, item) => sum + item.${field}, 0);`);
        lines.push(chainLines.join('\n'));
        return lines.join('\n');
      }
      case 'avg': {
        const field = op.arg.replace(/^\./, '');
        lines.push(chainLines.join('\n').replace('const result = ', ''));
        lines.push('');
        lines.push(`const result = ${variableName}.reduce((sum, item) => sum + item.${field}, 0) / ${variableName}.length;`);
        return lines.join('\n');
      }
    }
  }

  chainLines.push(';');
  lines.push(chainLines.join('\n'));
  return lines.join('\n');
}

function CodeGeneratorPanel({ pathExpression, filterExpression, onClose }) {
  const [activeTab, setActiveTab] = useState('java');
  const [copied, setCopied] = useState(false);

  const javaCode = generateJavaCode(pathExpression, filterExpression);
  const jsCode = generateJavaScriptCode(pathExpression, filterExpression);

  const code = activeTab === 'java' ? javaCode : jsCode;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-gray-300 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('java')}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === 'java'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Java
          </button>
          <button
            onClick={() => setActiveTab('javascript')}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === 'javascript'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            JavaScript
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        </div>
      </div>
      <pre className="max-h-72 overflow-auto p-4 font-mono text-xs leading-relaxed text-gray-800">
        {code}
      </pre>
    </div>
  );
}

export default function JsonPathFinderLayout({ tool }) {
  const [jsonInput, setJsonInput] = useState('');
  const [pathExpression, setPathExpression] = useState('');
  const [filterExpression, setFilterExpression] = useState('');
  const [treeData, setTreeData] = useState(null);
  const [evaluatedValue, setEvaluatedValue] = useState(null);
  const [filteredResult, setFilteredResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedNodes, setExpandedNodes] = useState(new Set(['x']));
  const [showHelp, setShowHelp] = useState(false);
  const [showCodeGen, setShowCodeGen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const debounceRef = useRef(null);
  const gutterRef = useRef(null);
  const textareaRef = useRef(null);

  const lineCount = Math.max((jsonInput || '').split('\n').length, 1);

  const syncScroll = useCallback(() => {
    if (gutterRef.current && textareaRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  const callBackend = useCallback(async (json, path, filter) => {
    if (!json || !json.trim()) {
      setTreeData(null);
      setEvaluatedValue(null);
      setFilteredResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tools/${tool.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonInput: json,
          pathExpression: path || '',
          filterExpression: filter || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Request failed (HTTP ${res.status})`);
        return;
      }
      if (data.paths) {
        setTreeData(buildTree(data.paths));
      }
      setEvaluatedValue(data.evaluatedValue);
      setFilteredResult(data.filteredResult);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tool.id]);

  const debouncedCall = useCallback((json, path, filter) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      callBackend(json, path, filter);
    }, 400);
  }, [callBackend]);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const handleJsonChange = (val) => {
    setJsonInput(val);
    setEvaluatedValue(null);
    setFilteredResult(null);
    debouncedCall(val, pathExpression, filterExpression);
  };

  const handlePathChange = (val) => {
    setPathExpression(val);
    if (jsonInput.trim()) {
      debouncedCall(jsonInput, val, filterExpression);
    }
  };

  const handleFilterChange = (val) => {
    setFilterExpression(val);
    if (jsonInput.trim()) {
      debouncedCall(jsonInput, pathExpression, val);
    }
  };

  const handlePathSelect = (path) => {
    setPathExpression(path);
    if (jsonInput.trim()) {
      callBackend(jsonInput, path, filterExpression);
    }
  };

  const handleCopyPath = async () => {
    if (!pathExpression) return;
    await navigator.clipboard.writeText(pathExpression);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleNode = (path) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const expandAll = () => {
    if (!treeData) return;
    const allPaths = new Set();
    function collect(node) {
      allPaths.add(node.path);
      if (node.children) node.children.forEach(collect);
    }
    collect(treeData);
    setExpandedNodes(allPaths);
  };

  const collapseAll = () => {
    setExpandedNodes(new Set(['x']));
  };

  const filteredTree = searchFilter && treeData
    ? filterTree(treeData, searchFilter.toLowerCase())
    : treeData;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left: JSON Input */}
        <div className="flex flex-col">
          <label className="mb-1.5 text-sm font-medium text-gray-700">JSON Input</label>
          <div className="flex overflow-hidden rounded-lg border border-gray-300 bg-white" style={{ height: '420px' }}>
            <div
              ref={gutterRef}
              className="w-10 select-none overflow-hidden border-r border-gray-200 bg-gray-50 py-2 font-mono text-xs leading-5 text-gray-400"
            >
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i} className="px-2 text-right">{i + 1}</div>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              value={jsonInput}
              onChange={(e) => handleJsonChange(e.target.value)}
              onScroll={syncScroll}
              placeholder={'Paste your JSON here...\n\n{\n  "store": {\n    "book": [\n      { "title": "Book 1", "price": 10 }\n    ]\n  }\n}'}
              className="flex-1 resize-none overflow-auto px-3 py-2 font-mono text-sm leading-5 text-gray-800 focus:outline-none"
              wrap="off"
              spellCheck={false}
            />
          </div>
        </div>

        {/* Right: Path Tree */}
        <div className="flex flex-col">
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">Path Tree</label>
            {treeData && (
              <div className="flex items-center gap-2">
                <button onClick={expandAll} className="text-xs text-blue-600 hover:underline">Expand All</button>
                <button onClick={collapseAll} className="text-xs text-blue-600 hover:underline">Collapse</button>
              </div>
            )}
          </div>
          <div className="flex flex-col overflow-hidden rounded-lg border border-gray-300 bg-white" style={{ height: '420px' }}>
            <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2">
              <Search size={14} className="text-gray-400" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter paths..."
                className="flex-1 text-xs text-gray-700 focus:outline-none"
              />
              {loading && <Loader2 size={14} className="animate-spin text-blue-500" />}
            </div>
            <div className="flex-1 overflow-auto py-1">
              {filteredTree ? (
                <TreeNode
                  node={filteredTree}
                  depth={0}
                  onSelect={handlePathSelect}
                  expandedNodes={expandedNodes}
                  toggleNode={toggleNode}
                />
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-center text-xs text-gray-400">
                  Paste valid JSON to see the path tree
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Path Expression */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-600">Path Expression</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={pathExpression}
                onChange={(e) => handlePathChange(e.target.value)}
                placeholder="x.store.book[0].title"
                className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={handleCopyPath}
                disabled={!pathExpression}
                className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>

        {evaluatedValue !== null && evaluatedValue !== undefined && (
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-gray-600">Value</label>
            <pre className="max-h-40 overflow-auto rounded-md border border-gray-200 bg-white p-3 font-mono text-xs text-gray-800">
              {typeof evaluatedValue === 'object' ? JSON.stringify(evaluatedValue, null, 2) : String(evaluatedValue)}
            </pre>
          </div>
        )}
      </div>

      {/* Stream Filter */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center justify-between">
          <label className="mb-1 block text-xs font-medium text-gray-600">
            <Filter size={12} className="mr-1 inline" />
            Stream Filter (applied to array at current path)
          </label>
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
          >
            <HelpCircle size={12} />
            {showHelp ? 'Hide' : 'Reference'}
          </button>
        </div>
        <input
          type="text"
          value={filterExpression}
          onChange={(e) => handleFilterChange(e.target.value)}
          placeholder="filter(.price > 10).map(.title).sort()"
          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />

        {showHelp && (
          <div className="mt-3">
            <StreamHelp onClose={() => setShowHelp(false)} />
          </div>
        )}

        {filteredResult && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-gray-600">
                {filteredResult.type === 'aggregate' ? 'Aggregate Result' : `Filtered Result (${filteredResult.value?.length || 0} items)`}
              </label>
              <button
                onClick={() => setShowCodeGen(!showCodeGen)}
                className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-blue-600"
              >
                <Code2 size={12} />
                {showCodeGen ? 'Hide Code' : 'Convert to Code'}
              </button>
            </div>
            <pre className="max-h-60 overflow-auto rounded-md border border-gray-200 bg-white p-3 font-mono text-xs text-gray-800">
              {filteredResult.type === 'aggregate'
                ? String(filteredResult.value)
                : JSON.stringify(filteredResult.value, null, 2)}
            </pre>
            {showCodeGen && (
              <CodeGeneratorPanel
                pathExpression={pathExpression}
                filterExpression={filterExpression}
                onClose={() => setShowCodeGen(false)}
              />
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <X size={18} className="mt-0.5 shrink-0 text-red-500" />
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}

function buildTree(paths) {
  if (!paths || paths.length === 0) return null;

  const root = { key: 'x', path: 'x', type: 'object', preview: '', children: [] };
  const nodeMap = { x: root };

  for (const p of paths) {
    if (p.path === 'x') {
      root.type = p.type;
      root.preview = p.preview;
      continue;
    }

    const lastDot = Math.max(p.path.lastIndexOf('.'), p.path.lastIndexOf('['));
    let parentPath, key;

    if (p.path[lastDot] === '[') {
      parentPath = p.path.substring(0, lastDot);
      key = p.path.substring(lastDot);
    } else {
      parentPath = p.path.substring(0, lastDot);
      key = p.path.substring(lastDot + 1);
    }

    const node = { key, path: p.path, type: p.type, preview: p.preview, children: [] };
    nodeMap[p.path] = node;

    const parent = nodeMap[parentPath];
    if (parent) {
      parent.children.push(node);
    }
  }

  return root;
}

function filterTree(node, query) {
  if (!node) return null;

  const matches = node.key.toLowerCase().includes(query) ||
                  node.path.toLowerCase().includes(query) ||
                  (node.preview && node.preview.toLowerCase().includes(query));

  const filteredChildren = (node.children || [])
    .map(child => filterTree(child, query))
    .filter(Boolean);

  if (matches || filteredChildren.length > 0) {
    return { ...node, children: filteredChildren };
  }
  return null;
}
