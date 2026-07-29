import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const disableM14FibLevelsPersist = process.env.TALARIA_TEST_DISABLE_M14_FIB_SETTINGS_LEVELS_PERSIST_V1 === '1';

global.window = {
    __TALARIA_DISABLE_M14_FIB_SETTINGS_LEVELS_PERSIST_V1: disableM14FibLevelsPersist,
};
global.window.parent = global.window;
global.window.top = global.window;

const DrawingToolsManager = require('./drawing-tools-manager.js');

const savedLevels = [
    { value: 0, label: '0', color: '#787b86', visible: true, locked: true },
    { value: 1, label: '1', color: '#787b86', visible: true, locked: true },
    { value: 1.1, label: '1.1', color: '#787b86', visible: true },
    { value: 1.3, label: '1.3', color: '#787b86', visible: true },
    { value: 1.5, label: '1.5', color: '#787b86', visible: true },
    { value: 1.8, label: '1.8', color: '#787b86', visible: true },
];

const manager = Object.create(DrawingToolsManager.prototype);
manager.savedToolStyles = {
    'fibonacci-retracement': {
        color: '#787b86',
        levelsLineDasharray: '',
        levelsLineWidth: 2,
        levels: savedLevels,
    },
};
manager._isTextDrawingType = () => false;

const drawing = {
    type: 'fibonacci-retracement',
    style: {},
    levels: [
        { value: 0, label: '0', color: '#787b86', visible: true, locked: true },
        { value: 1, label: '1', color: '#787b86', visible: true, locked: true },
        { value: 0.236, label: '0.236', color: '#f23645', visible: true },
        { value: 0.382, label: '0.382', color: '#ff9800', visible: true },
        { value: 0.5, label: '0.5', color: '#ffeb3b', visible: true },
        { value: 0.618, label: '0.618', color: '#4caf50', visible: true },
        { value: 0.786, label: '0.786', color: '#2196f3', visible: true },
    ],
};

manager.applySavedStyle(drawing);

const canonicalValues = drawing.levels.map((level) => level.value);
const styleValues = drawing.style.levels.map((level) => level.value);

assert.deepEqual(styleValues, [0, 1, 1.1, 1.3, 1.5, 1.8],
    'saved style carries accepted Fibonacci dialog levels');
assert.deepEqual(canonicalValues, [0, 1, 1.1, 1.3, 1.5, 1.8],
    'canonical drawing.levels must rehydrate from saved dialog levels before reopen/render');
assert.notEqual(drawing.levels, savedLevels,
    'rehydrated levels are cloned so later dialog edits cannot mutate saved defaults by reference');

console.log(disableM14FibLevelsPersist
    ? 'UNEXPECTED GREEN - switch-OFF should expose default-level revert'
    : 'GREEN - M14 Fibonacci dialog levels persist into canonical drawing levels');
