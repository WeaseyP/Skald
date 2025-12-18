### **Skald-UI: A Synthesized and Revised Master Plan**

This revised plan integrates critical feedback to prioritize type safety, incremental refactoring, and automated testing. Execute these steps sequentially.

---

### **Phase 1: Type Safety and Foundational Standardization** 🎯

**Goal:** Establish a strongly-typed foundation to eliminate data-related bugs before major refactoring begins.

* **Task R-1.1: Define Strict Data Contracts (New)**
    * Create a new file at `src/definitions/types.ts`.
    * In this file, audit `useGraphState.ts` and `ParameterPanel.tsx` to identify the data structure for each node's parameters.
    * Define and export a specific TypeScript `interface` for each node's parameter object (e.g., `OscillatorParams`, `ADSRParams`).
    * Create and export a union type `NodeParams` that includes all individual parameter interfaces (e.g., `export type NodeParams = OscillatorParams | ADSRParams | ...`).

* **Task R-1.2: Create Centralized Node Definition Manifest**
    * Create a new directory at `src/definitions/`.
    * Create a new file: `src/definitions/node-definitions.ts`.
    * In this file, import the newly created parameter types from `types.ts`.
    * Define and export a master configuration object `NODE_DEFINITIONS`.
    * For each node, create a key-value pair. The value object must now conform to the strict types.
    * **Example for ADSR**:
        ```typescript
        import { ADSRParams } from './types';

        const defaultADSR: ADSRParams = { /* Populate with type-safe values */ };

        export const NODE_DEFINITIONS = {
          ADSR: {
            type: 'ADSR',
            label: 'ADSR Envelope',
            defaultParameters: defaultADSR
          },
          // ... other nodes
        };
        ```

* **Task R-1.3: Update the Core `SkaldNode` Interface (New)**
    * Navigate to the `SkaldNode` interface definition.
    * Import the `NodeParams` union type.
    * Modify the `update` method signature from `update(data: any, ...)` to `update(data: Partial<NodeParams>, ...)`. This enforces type safety between the UI and the audio engine.

* **Task R-1.4: Standardize All Node Type Strings**
    * Refactor the entire application (starting with `app.tsx`) to import and use the `NODE_DEFINITIONS` object for all node type strings and default parameter lookups, removing all hardcoded values.

---

### **Phase 2: Decoupling State and Logic** 🧩

**Goal:** Separate UI state management from business logic to improve modularity and enable focused testing.

* **Task R-2.1: Isolate Node Composition Logic**
    * Create a new custom hook: `useNodeComposition.ts`.
    * Move all logic related to creating, connecting, and deleting nodes and edges from `useGraphState.ts` into `useNodeComposition.ts`.
    * This new hook will contain functions like `handleCreateInstrument`, `handleCreateConductor`, etc.

* **Task R-2.2: Define Hook Communication Contract (New)**
    * Before implementation, explicitly define how `useGraphState` and `useNodeComposition` will interact. The recommended pattern is for `useNodeComposition` to return functions that `useGraphState` will call to update its state. This makes the data flow clear and predictable.

* **Task R-2.3: Refactor `useGraphState`**
    * Remove the migrated logic from `useGraphState.ts`, leaving it responsible only for managing the `nodes` and `edges` state arrays.
    * Instantiate `useNodeComposition` from within `useGraphState` and use its returned functions to handle all state updates.

* **Task R-2.4: Write Integration Tests (New)** 🧪
    * Using **React Testing Library**, create a new test file `useGraphState.test.ts`.
    * Write integration tests to verify the interaction between the two hooks.
    * **Test Case Example**: Write a test that calls the `handleCreateInstrument` function and asserts that the `nodes` state in `useGraphState` is updated correctly with the expected new nodes.

---

### **Phase 3: Incremental Audio Engine Rewrite and Validation** 🎶

**Goal:** Safely replace the legacy audio engine with the new, standardized `SkaldNode` system while maintaining application stability at every step.

* **Task R-3.1: Create the New `useAudioEngine` Hook**
    * Create a new hook file: `useAudioEngine.v2.ts`.
    * This hook will be responsible for managing the Web Audio API nodes based on the state from `useGraphState`.

* **Task R-3.2: Implement the "Strangler Fig" Pattern (Revised)**
    * Instead of a single "big bang" rewrite, migrate the audio engine one node at a time.
    * **Step 1**: In `useAudioEngine.v2.ts`, implement the logic to handle only **one** simple node (e.g., `Oscillator`) using the new `SkaldNode` interface. All other node types should still be handled by the old `useDeepCompareEffect` logic in the original `useAudioEngine.ts`.
    * **Step 2**: Once the `Oscillator` is confirmed to work correctly, migrate the next node type (e.g., `Filter`).
    * **Step 3**: Continue this process incrementally, node by node, "strangling" the old logic until all node types are handled by `useAudioEngine.v2.ts`.

* **Task R-3.3: Finalize the Migration**
    * Once all nodes are migrated and verified, delete the old `useAudioEngine.ts` and rename `useAudioEngine.v2.ts` to `useAudioEngine.ts`.

* **Task R-3.4: Write End-to-End Tests (New)** 🤖
    * Using **Playwright** or **Cypress**, create a new suite of end-to-end tests.
    * These tests will automate the manual validation steps that were previously required.
    * **Test Case Example**: Write a test that:
        1.  Launches the application in a headless browser.
        2.  Programmatically creates an `Oscillator` node and a `GraphOutput` node.
        3.  Connects the two nodes.
        4.  Changes the oscillator's frequency via the UI.
        5.  Verifies that the core audio functionality behaves as expected (this may involve mocking or analyzing the audio output).
    * This automated suite provides a permanent safety net against future regressions.