// GoogleSheetsClone.js
import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { Bar } from 'react-chartjs-2';
import 'chart.js/auto';


const GoogleSheetsClone = () => {
  // Initial grid dimensions
  const INITIAL_ROWS = 20;
  const INITIAL_COLS = 10;

  // State for grid dimensions
  const [rowCount, setRowCount] = useState(INITIAL_ROWS);
  const [colCount, setColCount] = useState(INITIAL_COLS);

  // State for column widths and row heights (for resizing)
  const [colWidths, setColWidths] = useState({});
  const [rowHeights, setRowHeights] = useState({});

  // Resizing states
  const [resizingCol, setResizingCol] = useState(null);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(0);
  const [resizingRow, setResizingRow] = useState(null);
  const [startY, setStartY] = useState(0);
  const [startHeight, setStartHeight] = useState(0);

  // Undo/Redo history
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);

  // Initialize grid state: each cell holds value, formula, style, and dataType
  const initializeGrid = (rows, cols) => {
    const newGrid = {};
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cellId = `${r},${c}`;
        newGrid[cellId] = {
          value: '',
          formula: '',
          style: {
            fontWeight: 'normal',
            fontStyle: 'normal',
            fontSize: '14px',
            color: '#000',
            textDecoration: 'none',
            textAlign: 'left'
          },
          dataType: 'text'
        };
      }
    }
    return newGrid;
  };

  const [grid, setGrid] = useState(() => initializeGrid(rowCount, colCount));
  const [activeCell, setActiveCell] = useState(null);
  const [formulaBarValue, setFormulaBarValue] = useState('');
  const [selectedCells, setSelectedCells] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);

  // Ref for cell elements
  const cellRefs = useRef({});

  // Chart modal state
  const [showChart, setShowChart] = useState(false);

  // ----------------------------------------------------------------------
  // Utility Functions
  // ----------------------------------------------------------------------
  const getColLetter = (index) => String.fromCharCode(65 + index);
  const getCellRef = (row, col) => `${getColLetter(col)}${row + 1}`;

  const parseCellRef = (ref) => {
    const cleanRef = ref.replace(/\$/g, '');
    const match = cleanRef.match(/([A-Z]+)(\d+)/);
    if (!match) return null;
    const colLetters = match[1];
    const row = parseInt(match[2], 10) - 1;
    let col = 0;
    for (let i = 0; i < colLetters.length; i++) {
      col = col * 26 + (colLetters.charCodeAt(i) - 64);
    }
    return { row, col: col - 1 };
  };

  // ----------------------------------------------------------------------
  // Formula Engine and Helpers
  // ----------------------------------------------------------------------
  const evaluateFormula = (formula, cellId) => {
    if (!formula.startsWith('=')) return formula;
    try {
      const expression = formula.substring(1).trim();
      const functionMatch = expression.match(/^([A-Z_]+)\((.*)\)$/i);
      if (functionMatch) {
        const funcName = functionMatch[1].toUpperCase();
        const argsStr = functionMatch[2];
        if (["SUM", "AVERAGE", "MAX", "MIN", "COUNT", "MEDIAN", "MODE"].includes(funcName)) {
          let values = [];
          if (argsStr.includes(':')) {
            values = getRangeValues(argsStr);
          } else {
            values = argsStr.split(',').map(arg => parseFloat(resolveArgument(arg)));
          }
          switch (funcName) {
            case "SUM":
              return values.reduce((acc, val) => acc + (isNaN(val) ? 0 : val), 0).toString();
            case "AVERAGE": {
              const nums = values.filter(v => !isNaN(v));
              return (nums.length ? (nums.reduce((acc, v) => acc + v, 0) / nums.length) : 0).toString();
            }
            case "MAX":
              return Math.max(...values.filter(v => !isNaN(v))).toString();
            case "MIN":
              return Math.min(...values.filter(v => !isNaN(v))).toString();
            case "COUNT":
              return values.filter(v => !isNaN(v)).length.toString();
            case "MEDIAN": {
              const nums = values.filter(v => !isNaN(v)).sort((a, b) => a - b);
              if (nums.length === 0) return '0';
              const mid = Math.floor(nums.length / 2);
              const median = (nums.length % 2 !== 0) ? nums[mid] : ((nums[mid - 1] + nums[mid]) / 2);
              return median.toString();
            }
            case "MODE": {
              const nums = values.filter(v => !isNaN(v));
              const frequency = {};
              nums.forEach(num => frequency[num] = (frequency[num] || 0) + 1);
              let mode = null, maxFreq = 0;
              for (const num in frequency) {
                if (frequency[num] > maxFreq) {
                  maxFreq = frequency[num];
                  mode = num;
                }
              }
              return mode !== null ? mode.toString() : '';
            }
            default:
              return '#ERROR';
          }
        } else if (funcName === "TRIM") {
          return resolveArgument(argsStr).trim();
        } else if (funcName === "UPPER") {
          return resolveArgument(argsStr).toUpperCase();
        } else if (funcName === "LOWER") {
          return resolveArgument(argsStr).toLowerCase();
        } else if (funcName === "REMOVE_DUPLICATES") {
          const rows = getRangeValues2D(argsStr);
          const uniqueRows = removeDuplicates(rows);
          return JSON.stringify(uniqueRows);
        } else if (funcName === "FIND_AND_REPLACE") {
          const parts = argsStr.split(',').map(p => p.trim());
          if (parts.length < 3) return '#ERROR';
          const searchText = resolveArgument(parts[0]);
          const replaceText = resolveArgument(parts[1]);
          const rangeRows = getRangeValues2D(parts[2]);
          return JSON.stringify(findAndReplace(rangeRows, searchText, replaceText));
        }
      }
      const cellRefPattern = /(\$?[A-Z]+\$?\d+)/g;
      let processedExpression = expression;
      const matches = expression.match(cellRefPattern) || [];
      for (const ref of matches) {
        const coords = parseCellRef(ref);
        if (!coords) continue;
        const id = `${coords.row},${coords.col}`;
        if (id === cellId) return '#CIRCULAR!';
        const cellValue = grid[id]?.value || 0;
        processedExpression = processedExpression.replace(ref, cellValue);
      }
      // eslint-disable-next-line no-eval
      const result = eval(processedExpression);
      return result.toString();
    } catch (error) {
      return '#ERROR';
    }
  };

  const resolveArgument = (arg) => {
    const trimmed = arg.trim();
    if (/^\$?[A-Z]+\$?\d+$/.test(trimmed)) {
      const coords = parseCellRef(trimmed);
      if (coords) {
        const id = `${coords.row},${coords.col}`;
        return grid[id]?.value || '';
      }
    }
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.substring(1, trimmed.length - 1);
    }
    return trimmed;
  };

  const getRangeValues = (rangeStr) => {
    const parts = rangeStr.split(':');
    if (parts.length !== 2) return [];
    const start = parseCellRef(parts[0]);
    const end = parseCellRef(parts[1]);
    if (!start || !end) return [];
    let values = [];
    for (let r = start.row; r <= end.row; r++) {
      for (let c = start.col; c <= end.col; c++) {
        const id = `${r},${c}`;
        const val = parseFloat(grid[id]?.value);
        values.push(isNaN(val) ? 0 : val);
      }
    }
    return values;
  };

  const getRangeValues2D = (rangeStr) => {
    const parts = rangeStr.split(':');
    if (parts.length !== 2) return [];
    const start = parseCellRef(parts[0]);
    const end = parseCellRef(parts[1]);
    if (!start || !end) return [];
    let values = [];
    for (let r = start.row; r <= end.row; r++) {
      let rowArr = [];
      for (let c = start.col; c <= end.col; c++) {
        const id = `${r},${c}`;
        rowArr.push(grid[id]?.value);
      }
      values.push(rowArr);
    }
    return values;
  };

  const removeDuplicates = (rows) => {
    const seen = new Set();
    const unique = [];
    rows.forEach(row => {
      const key = JSON.stringify(row);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(row);
      }
    });
    return unique;
  };

  const findAndReplace = (rows, searchText, replaceText) => {
    return rows.map(row =>
      row.map(cell => (typeof cell === 'string' ? cell.split(searchText).join(replaceText) : cell))
    );
  };

  // ----------------------------------------------------------------------
  // History management for undo/redo
  // ----------------------------------------------------------------------
  const pushHistory = () => {
    setHistory(prev => [...prev, JSON.parse(JSON.stringify(grid))]);
    setFuture([]);
  };

  // ----------------------------------------------------------------------
  // Cell Update and Dependency Handling
  // ----------------------------------------------------------------------
  const updateCell = (cellId, formula) => {
    pushHistory();
    const newGrid = { ...grid };
    const newValue = evaluateFormula(formula, cellId);
    const cellDataType = newGrid[cellId].dataType || "text";
    if (cellDataType === "number" && isNaN(parseFloat(newValue))) {
      newGrid[cellId].value = "#INVALID";
    } else if (cellDataType === "date" && isNaN(Date.parse(newValue))) {
      newGrid[cellId].value = "#INVALID";
    } else {
      newGrid[cellId].value = newValue;
    }
    newGrid[cellId].formula = formula;
    // Update dependent cells (simple propagation)
    Object.keys(newGrid).forEach(id => {
      const cell = newGrid[id];
      if (cell.formula && cell.formula.startsWith('=')) {
        newGrid[id] = { ...cell, value: evaluateFormula(cell.formula, id) };
      }
    });
    setGrid(newGrid);
  };

  // ----------------------------------------------------------------------
  // Undo/Redo Handlers
  // ----------------------------------------------------------------------
  const handleUndo = () => {
    if (history.length === 0) return;
    const previousState = history[history.length - 1];
    setHistory(history.slice(0, history.length - 1));
    setFuture(prev => [JSON.parse(JSON.stringify(grid)), ...prev]);
    setGrid(previousState);
  };

  const handleRedo = () => {
    if (future.length === 0) return;
    const nextState = future[0];
    setFuture(future.slice(1));
    setHistory(prev => [...prev, JSON.parse(JSON.stringify(grid))]);
    setGrid(nextState);
  };

  // ----------------------------------------------------------------------
  // Cell Formatting and Alignment
  // ----------------------------------------------------------------------
  const applyCellFormat = (formatType, value) => {
  if (!activeCell) return;
  pushHistory();
  const newGrid = { ...grid };
  const cell = newGrid[activeCell];
  const newStyle = { ...cell.style };
  switch (formatType) {
    case 'bold':
      newStyle.fontWeight = newStyle.fontWeight === 'bold' ? 'normal' : 'bold';
      break;
    case 'italic':
      newStyle.fontStyle = newStyle.fontStyle === 'italic' ? 'normal' : 'italic';
      break;
    case 'underline':
      newStyle.textDecoration = newStyle.textDecoration === 'underline' ? 'none' : 'underline';
      break;
    case 'fontsize':
      newStyle.fontSize = value;
      break;
    case 'fontFamily':
      newStyle.fontFamily = value;
      break;
    case 'color':
      newStyle.color = value;
      break;
    default:
      break;
  }
  newGrid[activeCell] = { ...cell, style: newStyle };
  setGrid(newGrid);
};

  const applyAlignment = (alignment) => {
    if (!activeCell) return;
    pushHistory();
    const newGrid = { ...grid };
    const cell = newGrid[activeCell];
    const newStyle = { ...cell.style, textAlign: alignment };
    newGrid[activeCell] = { ...cell, style: newStyle };
    setGrid(newGrid);
  };

  const handleDataTypeChange = (e) => {
    if (!activeCell) return;
    pushHistory();
    const newType = e.target.value;
    const newGrid = { ...grid };
    newGrid[activeCell].dataType = newType;
    setGrid(newGrid);
  };

  // ----------------------------------------------------------------------
  // Save/Load via localStorage
  // ----------------------------------------------------------------------
  const saveSpreadsheet = () => {
    const dataToSave = {
      grid,
      rowCount,
      colCount,
      colWidths,
      rowHeights
    };
    localStorage.setItem('spreadsheetData', JSON.stringify(dataToSave));
    alert("Spreadsheet saved!");
  };

  const loadSpreadsheet = () => {
    const loadedData = JSON.parse(localStorage.getItem('spreadsheetData'));
    if (loadedData) {
      pushHistory();
      setGrid(loadedData.grid);
      setRowCount(loadedData.rowCount);
      setColCount(loadedData.colCount);
      setColWidths(loadedData.colWidths || {});
      setRowHeights(loadedData.rowHeights || {});
      alert("Spreadsheet loaded!");
    } else {
      alert("No saved spreadsheet found.");
    }
  };

  // ----------------------------------------------------------------------
  // Grid Modification: Add/Delete Rows and Columns
  // ----------------------------------------------------------------------
  const addRow = () => {
    pushHistory();
    const newRowCount = rowCount + 1;
    const newGrid = { ...grid };
    for (let c = 0; c < colCount; c++) {
      const cellId = `${rowCount},${c}`;
      newGrid[cellId] = {
        value: '',
        formula: '',
        style: {
          fontWeight: 'normal',
          fontStyle: 'normal',
          fontSize: '14px',
          color: '#000',
          textDecoration: 'none',
          textAlign: 'left'
        },
        dataType: 'text'
      };
    }
    setGrid(newGrid);
    setRowCount(newRowCount);
  };

  const addColumn = () => {
    pushHistory();
    const newColCount = colCount + 1;
    const newGrid = { ...grid };
    for (let r = 0; r < rowCount; r++) {
      const cellId = `${r},${colCount}`;
      newGrid[cellId] = {
        value: '',
        formula: '',
        style: {
          fontWeight: 'normal',
          fontStyle: 'normal',
          fontSize: '14px',
          color: '#000',
          textDecoration: 'none',
          textAlign: 'left'
        },
        dataType: 'text'
      };
    }
    setGrid(newGrid);
    setColCount(newColCount);
  };

  const deleteRow = () => {
    if (rowCount <= 1) return;
    pushHistory();
    const newRowCount = rowCount - 1;
    const newGrid = { ...grid };
    for (let c = 0; c < colCount; c++) {
      const cellId = `${newRowCount},${c}`;
      delete newGrid[cellId];
    }
    setGrid(newGrid);
    setRowCount(newRowCount);
  };

  const deleteColumn = () => {
    if (colCount <= 1) return;
    pushHistory();
    const newColCount = colCount - 1;
    const newGrid = { ...grid };
    for (let r = 0; r < rowCount; r++) {
      const cellId = `${r},${newColCount}`;
      delete newGrid[cellId];
    }
    setGrid(newGrid);
    setColCount(newColCount);
  };

  // ----------------------------------------------------------------------
  // Resizing Functions for Columns and Rows
  // ----------------------------------------------------------------------
  const handleColResizeStart = (colIndex, e) => {
    e.stopPropagation();
    setResizingCol(colIndex);
    setStartX(e.clientX);
    const currentWidth = colWidths[colIndex] || 80;
    setStartWidth(currentWidth);
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (resizingCol !== null) {
        const deltaX = e.clientX - startX;
        const newWidth = Math.max(40, startWidth + deltaX);
        setColWidths(prev => ({ ...prev, [resizingCol]: newWidth }));
      }
    };
    const handleMouseUp = () => {
      if (resizingCol !== null) setResizingCol(null);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingCol, startX, startWidth]);

  const handleRowResizeStart = (rowIndex, e) => {
    e.stopPropagation();
    setResizingRow(rowIndex);
    setStartY(e.clientY);
    const currentHeight = rowHeights[rowIndex] || 24;
    setStartHeight(currentHeight);
  };

  useEffect(() => {
    const handleMouseMoveRow = (e) => {
      if (resizingRow !== null) {
        const deltaY = e.clientY - startY;
        const newHeight = Math.max(20, startHeight + deltaY);
        setRowHeights(prev => ({ ...prev, [resizingRow]: newHeight }));
      }
    };
    const handleMouseUpRow = () => {
      if (resizingRow !== null) setResizingRow(null);
    };
    document.addEventListener('mousemove', handleMouseMoveRow);
    document.addEventListener('mouseup', handleMouseUpRow);
    return () => {
      document.removeEventListener('mousemove', handleMouseMoveRow);
      document.removeEventListener('mouseup', handleMouseUpRow);
    };
  }, [resizingRow, startY, startHeight]);

  // ----------------------------------------------------------------------
  // Cell Event Handlers (Selection, Editing)
  // ----------------------------------------------------------------------
  const handleCellClick = (row, col, e) => {
    const cellId = `${row},${col}`;
    if (e?.shiftKey && activeCell) {
      const [activeRow, activeCol] = activeCell.split(',').map(Number);
      const startRow = Math.min(activeRow, row);
      const endRow = Math.max(activeRow, row);
      const startCol = Math.min(activeCol, col);
      const endCol = Math.max(activeCol, col);
      const newSelection = [];
      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          newSelection.push(`${r},${c}`);
        }
      }
      setSelectedCells(newSelection);
    } else {
      setActiveCell(cellId);
      setFormulaBarValue(grid[cellId]?.formula || '');
      setSelectedCells([cellId]);
    }
  };

  const handleCellChange = (e, row, col) => {
    const cellId = `${row},${col}`;
    const value = e.target.innerText;
    updateCell(cellId, value);
    setFormulaBarValue(value);
  };

  const handleFormulaChange = (e) => {
    setFormulaBarValue(e.target.value);
    if (activeCell) {
      updateCell(activeCell, e.target.value);
    }
  };

  const handleFormulaSubmit = (e) => {
    e.preventDefault();
    if (activeCell) {
      updateCell(activeCell, formulaBarValue);
      if (cellRefs.current[activeCell]) {
        cellRefs.current[activeCell].focus();
      }
    }
  };

  // ----------------------------------------------------------------------
  // Drag Selection Handlers
  // ----------------------------------------------------------------------
  const handleMouseDown = (row, col, e) => {
    if (e.button !== 0) return;
    const cellId = `${row},${col}`;
    setDragStart(cellId);
    setIsDragging(true);
    setActiveCell(cellId);
    setSelectedCells([cellId]);
    setFormulaBarValue(grid[cellId]?.formula || '');
  };

  const handleMouseEnter = (row, col) => {
    if (!isDragging || !dragStart) return;
    const [startRow, startCol] = dragStart.split(',').map(Number);
    const startR = Math.min(startRow, row);
    const endR = Math.max(startRow, row);
    const startC = Math.min(startCol, col);
    const endC = Math.max(startCol, col);
    const newSelection = [];
    for (let r = startR; r <= endR; r++) {
      for (let c = startC; c <= endC; c++) {
        newSelection.push(`${r},${c}`);
      }
    }
    setSelectedCells(newSelection);
  };

  const handleMouseUp = () => setIsDragging(false);

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => document.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  // ----------------------------------------------------------------------
  // Chart Data Visualization
  // ----------------------------------------------------------------------
  const getChartData = () => {
    let dataRange = [];
    if (selectedCells.length > 1) {
      dataRange = selectedCells.map(cellId => {
        const val = parseFloat(grid[cellId]?.value);
        return isNaN(val) ? 0 : val;
      });
    } else {
      for (let c = 0; c < colCount; c++) {
        const id = `0,${c}`;
        const val = parseFloat(grid[id]?.value);
        dataRange.push(isNaN(val) ? 0 : val);
      }
    }
    return {
      labels: dataRange.map((_, i) => `Col ${i + 1}`),
      datasets: [
        {
          label: 'Selected Data',
          data: dataRange,
          backgroundColor: 'rgba(26, 115, 232, 0.6)',
          borderColor: 'rgba(26, 115, 232, 1)',
          borderWidth: 1
        }
      ]
    };
  };

  // ----------------------------------------------------------------------
  // Render Helpers: Toolbar, Cell, and Grid Rendering
  // ----------------------------------------------------------------------
  const RenderToolbar = () => {
    const [activeTab, setActiveTab] = useState('format'); // State to track active tab
  
    return (
      <div className="toolbar" style={{ 
        position: 'relative', 
        zIndex: 1000, 
        pointerEvents: 'auto',
        background: 'linear-gradient(to bottom, #f8f9fa, #e9ecef)',
        borderBottom: '1px solid #dee2e6',
        boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
        borderRadius: '4px 4px 0 0'
      }}>
        <div className="toolbar-header" style={{ 
          display: 'flex', 
          borderBottom: '1px solid #dee2e6',
          padding: '4px 8px 0 8px'
        }}>
          <div className="toolbar-title" style={{ 
            fontWeight: 'bold', 
            fontSize: '14px',
            color: '#495057',
            padding: '4px 8px',
            marginRight: '20px'
          }}>
            Spreadsheet Editor
          </div>
          
          {/* Tab Navigation */}
          <div className="toolbar-tabs" style={{ display: 'flex' }}>
            {['format', 'insert', 'data', 'view', 'tools'].map(tab => (
              <div
                key={tab}
                className={`toolbar-tab ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '4px 12px',
                  cursor: 'pointer',
                  borderTopLeftRadius: '4px',
                  borderTopRightRadius: '4px',
                  marginRight: '2px',
                  backgroundColor: activeTab === tab ? '#ffffff' : 'transparent',
                  border: activeTab === tab ? '1px solid #dee2e6' : 'none',
                  borderBottom: activeTab === tab ? 'none' : 'inherit',
                  position: activeTab === tab ? 'relative' : 'static',
                  top: activeTab === tab ? '1px' : '0',
                  fontWeight: activeTab === tab ? 'bold' : 'normal',
                  color: activeTab === tab ? '#495057' : '#6c757d',
                  textTransform: 'capitalize'
                }}
              >
                {tab}
              </div>
            ))}
          </div>
        </div>
        
        {/* Tab Content */}
        <div className="toolbar-content" style={{ 
          backgroundColor: '#ffffff', 
          padding: '8px', 
          minHeight: '50px'
        }}>
          {/* Format Tab */}
          {activeTab === 'format' && (
            <div className="format-tab-content" style={{ display: 'flex', gap: '10px' }}>
              <div className="toolbar-group" style={{ 
                padding: '4px',
                border: '1px solid #ced4da',
                borderRadius: '4px'
              }}>
                <span className="toolbar-group-label" style={{ fontSize: '11px', display: 'block', color: '#6c757d', marginBottom: '4px' }}>Text Format</span>
                <div style={{ display: 'flex', gap: '2px' }}>
                  <button className="toolbar-button material-icons small-button" onClick={() => applyCellFormat('bold')} title="Bold">
                    format_bold
                  </button>
                  <button className="toolbar-button material-icons small-button" onClick={() => applyCellFormat('italic')} title="Italic">
                    format_italic
                  </button>
                  <button className="toolbar-button material-icons small-button" onClick={() => applyCellFormat('underline')} title="Underline">
                    format_underlined
                  </button>
                </div>
              </div>
              
              <div className="toolbar-group" style={{ 
                padding: '4px',
                border: '1px solid #ced4da',
                borderRadius: '4px'
              }}>
                <span className="toolbar-group-label" style={{ fontSize: '11px', display: 'block', color: '#6c757d', marginBottom: '4px' }}>Font</span>
                <div className="font-family-container">
                  <select
                    className="font-family-select"
                    onChange={(e) => applyCellFormat('fontFamily', e.target.value)}
                    value={activeCell ? grid[activeCell]?.style.fontFamily : 'Arial'}
                    style={{ border: '1px solid #dee2e6', height: '24px', width: '120px' }}
                  >
                    <option value="Arial">Arial</option>
                    <option value="Helvetica">Helvetica</option>
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Courier New">Courier New</option>
                    <option value="Georgia">Georgia</option>
                    <option value="Verdana">Verdana</option>
                  </select>
                </div>
              </div>
              
              <div className="toolbar-group" style={{ 
                padding: '4px',
                border: '1px solid #ced4da',
                borderRadius: '4px'
              }}>
                <span className="toolbar-group-label" style={{ fontSize: '11px', display: 'block', color: '#6c757d', marginBottom: '4px' }}>Alignment</span>
                <div style={{ display: 'flex', gap: '2px' }}>
                  <button className="toolbar-button material-icons small-button" onClick={() => applyAlignment('left')} title="Align Left">
                    format_align_left
                  </button>
                  <button className="toolbar-button material-icons small-button" onClick={() => applyAlignment('center')} title="Align Center">
                    format_align_center
                  </button>
                  <button className="toolbar-button material-icons small-button" onClick={() => applyAlignment('right')} title="Align Right">
                    format_align_right
                  </button>
                </div>
              </div>
              
              <div className="toolbar-group" style={{ 
                padding: '4px',
                border: '1px solid #ced4da',
                borderRadius: '4px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}>
                <span className="toolbar-group-label" style={{ fontSize: '11px', color: '#6c757d' }}>Color</span>
                <input
                  type="color"
                  className="toolbar-color-picker"
                  onChange={(e) => applyCellFormat('color', e.target.value)}
                  style={{ border: '1px solid #dee2e6', width: '24px', height: '24px' }}
                />
              </div>
              
              <div className="toolbar-group" style={{ 
                padding: '4px',
                border: '1px solid #ced4da',
                borderRadius: '4px'
              }}>
                <span className="toolbar-group-label" style={{ fontSize: '11px', display: 'block', color: '#6c757d', marginBottom: '4px' }}>Font Size</span>
                <select
                  className="font-size-select"
                  onChange={(e) => applyCellFormat('fontsize', e.target.value)}
                  value={activeCell ? grid[activeCell]?.style.fontSize : '14px'}
                  style={{ border: '1px solid #dee2e6', height: '24px', width: '60px' }}
                >
                  {[10, 12, 14, 16, 18, 20].map(size => (
                    <option key={size} value={`${size}px`}>
                      {size}px
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          
          {/* Insert Tab */}
          {activeTab === 'insert' && (
            <div className="insert-tab-content" style={{ display: 'flex', gap: '10px' }}>
              <div className="toolbar-group" style={{ 
                padding: '4px',
                border: '1px solid #ced4da',
                borderRadius: '4px'
              }}>
                <span className="toolbar-group-label" style={{ fontSize: '11px', display: 'block', color: '#6c757d', marginBottom: '4px' }}>Chart</span>
                <button onClick={() => setShowChart(true)} className="toolbar-button" style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  padding: '4px 8px', 
                  backgroundColor: '#f8f9fa',
                  border: '1px solid #dee2e6',
                  borderRadius: '4px'
                }}>
                  <span className="material-icons" style={{ fontSize: '20px', color: '#0d6efd' }}>
                    insert_chart
                  </span>
                  <span style={{ fontSize: '11px', marginTop: '2px' }}>Chart</span>
                </button>
              </div>
              
              {/* Add other insert options here */}
              <div className="toolbar-group" style={{ 
                padding: '4px',
                border: '1px solid #ced4da',
                borderRadius: '4px'
              }}>
                <span className="toolbar-group-label" style={{ fontSize: '11px', display: 'block', color: '#6c757d', marginBottom: '4px' }}>Table Structure</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button onClick={addRow} className="toolbar-button" style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    padding: '4px 8px', 
                    backgroundColor: '#f8f9fa',
                    border: '1px solid #dee2e6',
                    borderRadius: '4px'
                  }}>
                    <span className="material-icons" style={{ fontSize: '20px', color: '#198754' }}>
                      add_box
                    </span>
                    <span style={{ fontSize: '11px', marginTop: '2px' }}>Add Row</span>
                  </button>
                  
                  <button onClick={addColumn} className="toolbar-button" style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    padding: '4px 8px', 
                    backgroundColor: '#f8f9fa',
                    border: '1px solid #dee2e6',
                    borderRadius: '4px'
                  }}>
                    <span className="material-icons" style={{ fontSize: '20px', color: '#198754' }}>
                      add_box
                    </span>
                    <span style={{ fontSize: '11px', marginTop: '2px' }}>Add Column</span>
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* Data Tab */}
          {activeTab === 'data' && (
            <div className="data-tab-content" style={{ display: 'flex', gap: '10px' }}>
              <div className="toolbar-group" style={{ 
                padding: '4px',
                border: '1px solid #ced4da',
                borderRadius: '4px'
              }}>
                <span className="toolbar-group-label" style={{ fontSize: '11px', display: 'block', color: '#6c757d', marginBottom: '4px' }}>Data Type</span>
                <select
                  className="data-type-select"
                  onChange={handleDataTypeChange}
                  value={activeCell ? grid[activeCell]?.dataType : 'text'}
                  disabled={!activeCell}
                  style={{ border: '1px solid #dee2e6', height: '24px', width: '90px' }}
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                </select>
              </div>
              
              <div className="toolbar-group" style={{ 
                padding: '4px',
                border: '1px solid #ced4da',
                borderRadius: '4px',
                flex: '1 1 auto'
              }}>
                <span className="toolbar-group-label" style={{ fontSize: '11px', display: 'block', color: '#6c757d', marginBottom: '4px' }}>Formula</span>
                <div className="formula-bar" style={{ display: 'flex', alignItems: 'center' }}>
                  <span className="formula-icon material-icons" style={{ fontSize: '16px', color: '#6c757d', marginRight: '4px' }}>
                    functions
                  </span>
                  <input
                    type="text"
                    value={formulaBarValue}
                    onChange={handleFormulaChange}
                    className="formula-input"
                    placeholder="Enter formula"
                    style={{ 
                      flex: '1 1 auto', 
                      height: '24px', 
                      padding: '0 8px',
                      border: '1px solid #dee2e6',
                      borderRadius: '3px'
                    }}
                  />
                </div>
              </div>
              
              <div className="toolbar-group" style={{ 
                padding: '4px',
                border: '1px solid #ced4da',
                borderRadius: '4px'
              }}>
                <span className="toolbar-group-label" style={{ fontSize: '11px', display: 'block', color: '#6c757d', marginBottom: '4px' }}>Delete</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button onClick={deleteRow} className="toolbar-button" style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    padding: '4px 8px', 
                    backgroundColor: '#f8f9fa',
                    border: '1px solid #dee2e6',
                    borderRadius: '4px'
                  }}>
                    <span className="material-icons" style={{ fontSize: '20px', color: '#dc3545' }}>
                      remove_circle
                    </span>
                    <span style={{ fontSize: '11px', marginTop: '2px' }}>Delete Row</span>
                  </button>
                  
                  <button onClick={deleteColumn} className="toolbar-button" style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    padding: '4px 8px', 
                    backgroundColor: '#f8f9fa',
                    border: '1px solid #dee2e6',
                    borderRadius: '4px'
                  }}>
                    <span className="material-icons" style={{ fontSize: '20px', color: '#dc3545' }}>
                      remove_circle
                    </span>
                    <span style={{ fontSize: '11px', marginTop: '2px' }}>Delete Column</span>
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* View Tab */}
          {activeTab === 'view' && (
            <div className="view-tab-content" style={{ padding: '10px' }}>
              <div style={{ fontSize: '14px', color: '#6c757d' }}>
                View options will be available soon.
              </div>
            </div>
          )}
          
          {/* Tools Tab */}
          {activeTab === 'tools' && (
            <div className="tools-tab-content" style={{ display: 'flex', gap: '10px' }}>
              <div className="toolbar-group" style={{ 
                padding: '4px',
                border: '1px solid #ced4da',
                borderRadius: '4px'
              }}>
                <span className="toolbar-group-label" style={{ fontSize: '11px', display: 'block', color: '#6c757d', marginBottom: '4px' }}>History</span>
                <div style={{ display: 'flex', gap: '2px' }}>
                  <button className="toolbar-button material-icons small-button" onClick={handleUndo} title="Undo">
                    undo
                  </button>
                  <button className="toolbar-button material-icons small-button" onClick={handleRedo} title="Redo">
                    redo
                  </button>
                </div>
              </div>
              
              <div className="toolbar-group" style={{ 
                padding: '4px',
                border: '1px solid #ced4da',
                borderRadius: '4px'
              }}>
                <span className="toolbar-group-label" style={{ fontSize: '11px', display: 'block', color: '#6c757d', marginBottom: '4px' }}>File Operations</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button onClick={saveSpreadsheet} className="toolbar-button" style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    padding: '4px 8px', 
                    backgroundColor: '#f8f9fa',
                    border: '1px solid #dee2e6',
                    borderRadius: '4px'
                  }}>
                    <span className="material-icons" style={{ fontSize: '20px', color: '#0d6efd' }}>
                      save
                    </span>
                    <span style={{ fontSize: '11px', marginTop: '2px' }}>Save</span>
                  </button>
                  
                  <button onClick={loadSpreadsheet} className="toolbar-button" style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    padding: '4px 8px', 
                    backgroundColor: '#f8f9fa',
                    border: '1px solid #dee2e6',
                    borderRadius: '4px'
                  }}>
                    <span className="material-icons" style={{ fontSize: '20px', color: '#0d6efd' }}>
                      folder_open
                    </span>
                    <span style={{ fontSize: '11px', marginTop: '2px' }}>Open</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderCell = (row, col) => {
    const cellId = `${row},${col}`;
    const isActive = activeCell === cellId;
    const isSelected = selectedCells.includes(cellId);
    return (
      <td
        key={col}
        className={`grid-cell ${isActive ? 'cell-active' : ''}`}
        onMouseDown={(e) => { handleMouseDown(row, col, e); handleCellClick(row, col, e); }}
        onMouseEnter={() => handleMouseEnter(row, col)}
        style={{
          width: colWidths[col] || 120,
          backgroundColor: isActive ? '#e9f0fd' : isSelected ? '#f2f7fd' : 'white',
          ...grid[cellId]?.style
        }}
      >
        <div
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => handleCellChange(e, row, col)}
          ref={(el) => (cellRefs.current[cellId] = el)}
          style={{
            width: '100%',
            height: '100%',
            textDecoration: grid[cellId]?.style.textDecoration
          }}
        >
          {grid[cellId]?.value}
        </div>
      </td>
    );
  };

  const renderGrid = () => (
    <div className="sheet-grid">
      <table className="grid-table">
        <thead>
          <tr>
            <th className="row-header"></th>
            {Array.from({ length: colCount }).map((_, col) => (
              <th key={col} className="grid-header">
                {getColLetter(col)}
                <div className="resize-handle col" onMouseDown={(e) => handleColResizeStart(col, e)} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }).map((_, row) => (
            <tr key={row} style={{ height: rowHeights[row] || 24 }}>
              <th className="row-header">
                {row + 1}
                <div className="resize-handle row" onMouseDown={(e) => handleRowResizeStart(row, e)} />
              </th>
              {Array.from({ length: colCount }).map((_, col) => renderCell(row, col))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="app">
      {RenderToolbar()}
      {renderGrid()}
      <div className="status-bar">
        {selectedCells.length > 1
          ? `${selectedCells.length} cells selected`
          : activeCell
            ? `${getCellRef(...activeCell.split(',').map(Number))}`
            : 'Ready'}
      </div>
      {showChart && (
        <div className="chart-modal">
          <div className="chart-modal-content">
            <button className="chart-modal-close material-icons" onClick={() => setShowChart(false)}>
              close
            </button>
            <h2>Chart - {selectedCells.length} Selected Cells</h2>
            <div className="chart-container">
              <Bar data={getChartData()} options={{ maintainAspectRatio: false }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GoogleSheetsClone;