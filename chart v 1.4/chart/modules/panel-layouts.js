/**
 * Panel layout configuration registry.
 * Each key maps to an array of cell descriptors { width, height, left?, top? } (all %-strings).
 * Consumed by PanelManager.applyLayout() and the layout-picker dropdown.
 */
const PANEL_LAYOUTS = {
    '1': [{ width: '100%', height: '100%' }],

    '2v': [
        { width: '50%', height: '100%', left: '0' },
        { width: '50%', height: '100%', left: '50%' }
    ],
    '2h': [
        { width: '100%', height: '50%', top: '0' },
        { width: '100%', height: '50%', top: '50%' }
    ],

    '3v': [
        { width: '33.33%', height: '100%', left: '0' },
        { width: '33.33%', height: '100%', left: '33.33%' },
        { width: '33.33%', height: '100%', left: '66.66%' }
    ],
    '3h': [
        { width: '100%', height: '33.33%', top: '0' },
        { width: '100%', height: '33.33%', top: '33.33%' },
        { width: '100%', height: '33.33%', top: '66.66%' }
    ],
    '3l': [
        { width: '50%', height: '100%', left: '0' },
        { width: '50%', height: '50%', left: '50%', top: '0' },
        { width: '50%', height: '50%', left: '50%', top: '50%' }
    ],
    '3r': [
        { width: '50%', height: '50%', left: '0', top: '0' },
        { width: '50%', height: '50%', left: '0', top: '50%' },
        { width: '50%', height: '100%', left: '50%', top: '0' }
    ],
    '3t': [
        { width: '100%', height: '50%', left: '0', top: '0' },
        { width: '50%', height: '50%', left: '0', top: '50%' },
        { width: '50%', height: '50%', left: '50%', top: '50%' }
    ],
    '3b': [
        { width: '50%', height: '50%', left: '0', top: '0' },
        { width: '50%', height: '50%', left: '50%', top: '0' },
        { width: '100%', height: '50%', left: '0', top: '50%' }
    ],

    '4': [
        { width: '50%', height: '50%', left: '0', top: '0' },
        { width: '50%', height: '50%', left: '50%', top: '0' },
        { width: '50%', height: '50%', left: '0', top: '50%' },
        { width: '50%', height: '50%', left: '50%', top: '50%' }
    ],
    '4v': [
        { width: '25%', height: '100%', left: '0' },
        { width: '25%', height: '100%', left: '25%' },
        { width: '25%', height: '100%', left: '50%' },
        { width: '25%', height: '100%', left: '75%' }
    ],
    '4h': [
        { width: '100%', height: '25%', top: '0' },
        { width: '100%', height: '25%', top: '25%' },
        { width: '100%', height: '25%', top: '50%' },
        { width: '100%', height: '25%', top: '75%' }
    ],
    '4t': [
        { width: '100%', height: '50%', left: '0', top: '0' },
        { width: '33.33%', height: '50%', left: '0', top: '50%' },
        { width: '33.33%', height: '50%', left: '33.33%', top: '50%' },
        { width: '33.33%', height: '50%', left: '66.66%', top: '50%' }
    ],
    '4b': [
        { width: '33.33%', height: '50%', left: '0', top: '0' },
        { width: '33.33%', height: '50%', left: '33.33%', top: '0' },
        { width: '33.33%', height: '50%', left: '66.66%', top: '0' },
        { width: '100%', height: '50%', left: '0', top: '50%' }
    ],
    '4r': [
        { width: '50%', height: '33.33%', left: '0', top: '0' },
        { width: '50%', height: '33.33%', left: '0', top: '33.33%' },
        { width: '50%', height: '33.33%', left: '0', top: '66.66%' },
        { width: '50%', height: '100%', left: '50%', top: '0' }
    ],
    '4l': [
        { width: '50%', height: '100%', left: '0', top: '0' },
        { width: '50%', height: '33.33%', left: '50%', top: '0' },
        { width: '50%', height: '33.33%', left: '50%', top: '33.33%' },
        { width: '50%', height: '33.33%', left: '50%', top: '66.66%' }
    ],
    '4tl': [
        { width: '66.66%', height: '60%', left: '0', top: '0' },
        { width: '33.33%', height: '60%', left: '66.66%', top: '0' },
        { width: '50%', height: '40%', left: '0', top: '60%' },
        { width: '50%', height: '40%', left: '50%', top: '60%' }
    ],

    '5a': [
        { width: '50%', height: '50%', left: '0', top: '0' },
        { width: '50%', height: '50%', left: '50%', top: '0' },
        { width: '33.33%', height: '50%', left: '0', top: '50%' },
        { width: '33.33%', height: '50%', left: '33.33%', top: '50%' },
        { width: '33.33%', height: '50%', left: '66.66%', top: '50%' }
    ],
    '5b': [
        { width: '33.33%', height: '50%', left: '0', top: '0' },
        { width: '33.33%', height: '50%', left: '33.33%', top: '0' },
        { width: '33.33%', height: '50%', left: '66.66%', top: '0' },
        { width: '50%', height: '50%', left: '0', top: '50%' },
        { width: '50%', height: '50%', left: '50%', top: '50%' }
    ],
    '5c': [
        { width: '50%', height: '50%', left: '0', top: '0' },
        { width: '50%', height: '50%', left: '0', top: '50%' },
        { width: '50%', height: '33.33%', left: '50%', top: '0' },
        { width: '50%', height: '33.33%', left: '50%', top: '33.33%' },
        { width: '50%', height: '33.33%', left: '50%', top: '66.66%' }
    ],
    '5v': [
        { width: '20%', height: '100%', left: '0' },
        { width: '20%', height: '100%', left: '20%' },
        { width: '20%', height: '100%', left: '40%' },
        { width: '20%', height: '100%', left: '60%' },
        { width: '20%', height: '100%', left: '80%' }
    ],
    '5h': [
        { width: '100%', height: '20%', top: '0' },
        { width: '100%', height: '20%', top: '20%' },
        { width: '100%', height: '20%', top: '40%' },
        { width: '100%', height: '20%', top: '60%' },
        { width: '100%', height: '20%', top: '80%' }
    ],

    '6': [
        { width: '33.33%', height: '50%', left: '0', top: '0' },
        { width: '33.33%', height: '50%', left: '33.33%', top: '0' },
        { width: '33.33%', height: '50%', left: '66.66%', top: '0' },
        { width: '33.33%', height: '50%', left: '0', top: '50%' },
        { width: '33.33%', height: '50%', left: '33.33%', top: '50%' },
        { width: '33.33%', height: '50%', left: '66.66%', top: '50%' }
    ],
    '6b': [
        { width: '50%', height: '33.33%', left: '0', top: '0' },
        { width: '50%', height: '33.33%', left: '50%', top: '0' },
        { width: '50%', height: '33.33%', left: '0', top: '33.33%' },
        { width: '50%', height: '33.33%', left: '50%', top: '33.33%' },
        { width: '50%', height: '33.33%', left: '0', top: '66.66%' },
        { width: '50%', height: '33.33%', left: '50%', top: '66.66%' }
    ],
    '6v': [
        { width: '16.66%', height: '100%', left: '0' },
        { width: '16.66%', height: '100%', left: '16.66%' },
        { width: '16.66%', height: '100%', left: '33.33%' },
        { width: '16.66%', height: '100%', left: '50%' },
        { width: '16.66%', height: '100%', left: '66.66%' },
        { width: '16.66%', height: '100%', left: '83.33%' }
    ],
    '6h': [
        { width: '100%', height: '16.66%', top: '0' },
        { width: '100%', height: '16.66%', top: '16.66%' },
        { width: '100%', height: '16.66%', top: '33.33%' },
        { width: '100%', height: '16.66%', top: '50%' },
        { width: '100%', height: '16.66%', top: '66.66%' },
        { width: '100%', height: '16.66%', top: '83.33%' }
    ],

    '7v': [
        { width: '14.28%', height: '100%', left: '0' },
        { width: '14.28%', height: '100%', left: '14.28%' },
        { width: '14.28%', height: '100%', left: '28.56%' },
        { width: '14.28%', height: '100%', left: '42.84%' },
        { width: '14.28%', height: '100%', left: '57.12%' },
        { width: '14.28%', height: '100%', left: '71.4%' },
        { width: '14.28%', height: '100%', left: '85.68%' }
    ],
    '7a': [
        { width: '33.33%', height: '33.33%', left: '0', top: '0' },
        { width: '33.33%', height: '33.33%', left: '33.33%', top: '0' },
        { width: '33.33%', height: '33.33%', left: '66.66%', top: '0' },
        { width: '33.33%', height: '33.33%', left: '0', top: '33.33%' },
        { width: '33.33%', height: '33.33%', left: '33.33%', top: '33.33%' },
        { width: '33.33%', height: '33.33%', left: '66.66%', top: '33.33%' },
        { width: '100%', height: '33.33%', left: '0', top: '66.66%' }
    ],

    '8': [
        { width: '25%', height: '50%', left: '0', top: '0' },
        { width: '25%', height: '50%', left: '25%', top: '0' },
        { width: '25%', height: '50%', left: '50%', top: '0' },
        { width: '25%', height: '50%', left: '75%', top: '0' },
        { width: '25%', height: '50%', left: '0', top: '50%' },
        { width: '25%', height: '50%', left: '25%', top: '50%' },
        { width: '25%', height: '50%', left: '50%', top: '50%' },
        { width: '25%', height: '50%', left: '75%', top: '50%' }
    ],
    '8b': [
        { width: '50%', height: '25%', left: '0', top: '0' },
        { width: '50%', height: '25%', left: '50%', top: '0' },
        { width: '50%', height: '25%', left: '0', top: '25%' },
        { width: '50%', height: '25%', left: '50%', top: '25%' },
        { width: '50%', height: '25%', left: '0', top: '50%' },
        { width: '50%', height: '25%', left: '50%', top: '50%' },
        { width: '50%', height: '25%', left: '0', top: '75%' },
        { width: '50%', height: '25%', left: '50%', top: '75%' }
    ],
    '8v': [
        { width: '12.5%', height: '100%', left: '0' },
        { width: '12.5%', height: '100%', left: '12.5%' },
        { width: '12.5%', height: '100%', left: '25%' },
        { width: '12.5%', height: '100%', left: '37.5%' },
        { width: '12.5%', height: '100%', left: '50%' },
        { width: '12.5%', height: '100%', left: '62.5%' },
        { width: '12.5%', height: '100%', left: '75%' },
        { width: '12.5%', height: '100%', left: '87.5%' }
    ],
    '8h': [
        { width: '100%', height: '12.5%', top: '0' },
        { width: '100%', height: '12.5%', top: '12.5%' },
        { width: '100%', height: '12.5%', top: '25%' },
        { width: '100%', height: '12.5%', top: '37.5%' },
        { width: '100%', height: '12.5%', top: '50%' },
        { width: '100%', height: '12.5%', top: '62.5%' },
        { width: '100%', height: '12.5%', top: '75%' },
        { width: '100%', height: '12.5%', top: '87.5%' }
    ]
};
