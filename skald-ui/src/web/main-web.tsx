// Web entry point: install the browser stand-in for the Electron bridge
// BEFORE any renderer module evaluates (app code reads window.electron at
// call time, but the dynamic import guarantees ordering regardless).
import { installElectronShim } from './electronShim';

installElectronShim();

import('../renderer');
