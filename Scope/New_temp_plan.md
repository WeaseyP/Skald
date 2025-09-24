Skald Audio Engine Refactoring: Plan and Task List
1. Introduction
This document provides a detailed, phased implementation plan for refactoring the Skald frontend audio preview engine. The goal is to resolve current instability and create a robust, scalable, and maintainable architecture. This plan is based on the strategic recommendations outlined in the technical report, "A Scalable Architecture for the Skald Real-Time Audio Preview Engine."
2. Core Architectural Principles
The refactoring process will be guided by three core principles:
 * Embrace the Dual-Engine Architecture: We will formalize the separation between the frontend preview engine (Web Audio API) and the backend test harness (Odin). The frontend will serve as a high-fidelity tool for rapid prototyping, while the backend remains the definitive ground-truth for validating the final, production-ready code.
 * Adopt a Command-Based Architecture: The current, fragile state-diffing logic in useAudioEngine.ts will be replaced with the Command design pattern. The UI will dispatch explicit, serializable command objects to a new, decoupled AudioEngineService, creating a stable and testable boundary between the UI and the audio graph.
 * Standardize Node Interactions with a Unified Interface: A new SkaldNode TypeScript interface will be implemented by all audio node wrappers. This will abstract the implementation details of individual nodes, creating a modular, plug-in-like architecture that is significantly easier to maintain and extend.
3. Detailed Implementation Plan
The refactor is broken down into four distinct phases. Each phase builds upon the last to ensure a structured and manageable transition to the new architecture.
Phase 1: Foundational Refactoring (The SkaldNode Contract)
Goal: Establish the core abstractions and contracts that will govern the new architecture. This phase focuses on making all audio node wrappers conform to a single, unified interface.
 * Define the SkaldNode Interface:
   * In a shared types file (e.g., src/hooks/nodeEditor/types.ts), formally define the SkaldNode TypeScript interface.
| Method/Property | Signature | Description |
|---|---|---|
| id | readonly string | The unique identifier of the node, matching the React Flow node ID. |
| getAudioNode() | (): AudioNode | Returns the primary, connectable Web Audio API node that represents this SkaldNode. |
| getOutput(portName: string) | (): AudioNode | Returns a specific output AudioNode for connection. |
| connectInput(sourceNode: AudioNode, targetPortName: string) | (sourceNode: AudioNode, targetPortName: string): void | Encapsulates all logic for connecting a source to the correct internal AudioNode or AudioParam. |
| disconnectInput(sourceNode: AudioNode, targetPortName:string) | (sourceNode: AudioNode, targetPortName: string): void | Handles the disconnection of an incoming sourceNode. |
| update(data: any, bpm: number) | (data: any, bpm: number): void | Updates the node's internal state and AudioParam values. |
| dispose() | (): void | Performs cleanup by disconnecting all Web Audio connections. |
 * Refactor All Node Wrappers:
   * Systematically update every create...Node.ts file in the src/hooks/nodeEditor/audioNodeFactory directory.
   * For each file, ensure the node's wrapper class (e.g., ADSRNode, DelayNode) formally implements the SkaldNode interface.
   * Pay close attention to the connectInput method, moving all type-specific connection logic (e.g., connecting to an AudioParam vs. a node's input) into the respective node's class.
   * Implement the dispose method in each class to properly disconnect all internal and external AudioNode connections, preventing memory leaks.
 * Standardize Naming Conventions:
   * Enforce PascalCase for all node type strings throughout the frontend codebase to match CONTRACT.md.
   * Update the keys in the nodeCreationMap in audioNodeFactory/index.ts.
   * Update the type property in the default node data within the onDrop handler in useGraphState.ts.
   * Update any switch statements or string comparisons that rely on node types, such as in ParameterPanel.tsx.
Phase 2: The New Audio Engine Service
Goal: Build the new, decoupled audio engine and rewire the UI to communicate with it via commands, completely removing the state-diffing logic from useAudioEngine.ts.
 * Create AudioEngineService.ts:
   * Create a new file for the AudioEngineService class. This class should be implemented as a singleton to ensure only one AudioContext is ever created and managed.
   * The service will maintain a private Map<string, SkaldNode> to hold all active audio node instances.
 * Implement the Command Dispatcher:
   * Define a public dispatch(command) method on the service. This method will be the single entry point for all UI-driven audio graph modifications.
   * Inside dispatch, create a switch statement that routes commands based on their type to private handler methods (e.g., _handleAddNode, _handleConnectNodes).
 * Implement Command Handlers:
   * _handleAddNode(payload): Will use the AudioNodeFactory to create a new SkaldNode instance and store it in the private map.
   * _handleRemoveNode(payload): Will retrieve the SkaldNode from the map, call its dispose() method, and then remove it from the map.
   * _handleConnectNodes(payload): Will retrieve the source and target SkaldNode instances from the map and call their respective getOutput and connectInput methods.
   * _handleUpdateParameter(payload): Will retrieve the SkaldNode from the map and call its update(data, bpm) method.
 * Refactor UI Hooks:
   * useAudioEngine.ts : This hook will be drastically simplified. Remove the useDeepCompareEffect and all associated state-diffing logic. Its new role is to instantiate the AudioEngineService singleton and provide simple handler functions (e.g., play, stop) that dispatch commands to the service.
   * useGraphState.ts : Modify the functions that manage the visual graph state (onConnect, onNodesChange, updateNodeData, etc.). These functions will now have a dual responsibility: update the React Flow state as they do now, and also dispatch the corresponding command object to the AudioEngineService.
Phase 3: Node and Worklet Correction
Goal: Refine the individual node implementations for correctness, performance, and adherence to best practices, leveraging the stability of the new architecture.
 * Implement Node Strategy:
   * Review each refactored node wrapper against the strategy defined in the table below.
   * For any node designated to "Compose Built-in Nodes," ensure the implementation correctly creates and connects the necessary standard AudioNodes. For example, refactor the LFO to use a built-in OscillatorNode and GainNode instead of a custom implementation.
| Node Type | Recommended Strategy | Rationale |
|---|---|---|
| Oscillator | Hybrid (AudioWorklet) | The built-in OscillatorNode is fast but limited. The existing worklet is necessary for features like phase control and PWM. |
| Noise | AudioWorklet | The standard API has no dedicated noise generator. The existing worklet is a clean, self-contained implementation. |
| ADSR | AudioWorklet | The stateful, multi-stage logic cannot be accurately modeled by composing built-in nodes. The worklet is the correct approach. |
| LFO | Compose Built-in Nodes | An LFO is an OscillatorNode at a sub-audio frequency connected to a GainNode to control modulation depth. |
| Filter | Compose Built-in Nodes | The BiquadFilterNode is a powerful, highly optimized node that directly supports all required filter types. |
| Delay | Compose Built-in Nodes | A standard feedback delay is built by connecting a DelayNode and a GainNode in a loop. |
| Distortion | Compose Built-in Nodes | The WaveShaperNode is specifically designed for implementing distortion effects and is the most efficient method. |
 * Optimize Audio Worklets:
   * Remove all console.log statements and any other potentially blocking operations from the process method of every AudioWorkletProcessor file.
   * Move the worklet processor code from template literal strings (e.g., oscillatorProcessorString) into separate static .js files (e.g., in the public/worklets/ directory).
   * Update the AudioEngineService to load these worklets using audioContext.audioWorklet.addModule('/worklets/processor-name.js') during its initialization, removing the inefficient Blob-based loading currently in useAudioEngine.ts.
Phase 4: Validation and Parity Testing
Goal: Rigorously test the new engine and validate its output against the backend's reference implementation to ensure functional and musical parity.
 * Establish a Testing Workflow:
   * For each JSON file located in the examples/ directory, perform a two-step validation.
   * Frontend Test: Load the JSON file into the Skald UI and listen to the audio preview.
   * Backend Test: Pass the same JSON file to the skald_codegen.exe CLI to generate the audio.odin source file. Use the build_and_test.bat script to compile and run the backend test harness and listen to the reference output.
 * Compare and Iterate:
   * Compare the audio outputs from the frontend preview and the backend harness. They should be functionally and musically equivalent (e.g., an LFO modulating a filter should produce a similar sweeping sound).
   * For any significant discrepancies, the Odin output is considered the ground truth. The task is to debug and correct the relevant SkaldNode wrapper or AudioWorklet in the frontend until its output is a reasonable approximation of the backend reference.
4. Actionable Task List
Phase 1: Foundational Refactoring
 * `` Define the SkaldNode TypeScript interface in src/hooks/nodeEditor/types.ts.
 * `` Refactor all node wrapper classes in src/hooks/nodeEditor/audioNodeFactory/ to implement the SkaldNode interface.
 * `` Implement a dispose() method in every SkaldNode wrapper to prevent Web Audio API memory leaks.
 * `` Globally standardize all node type strings to PascalCase (e.g., update nodeCreationMap, useGraphState.ts, ParameterPanel.tsx).
Phase 2: Audio Engine Service Implementation
 * `` Create the singleton AudioEngineService class in a new AudioEngineService.ts file.
 * `` Define the command object types (e.g., AddNode, RemoveNode, ConnectNodes, UpdateParameter).
 * `` Implement the dispatch(command) method and all private command handlers in AudioEngineService.
 * `` Completely remove the useDeepCompareEffect and state-diffing logic from useAudioEngine.ts.
 * `` Refactor useAudioEngine.ts to instantiate and interact with the AudioEngineService.
 * `` Update useGraphState.ts so that all graph mutation functions (e.g., onConnect) dispatch commands to the AudioEngineService.
Phase 3: Node and Worklet Correction
 * `` Refactor the LFO node to be a composition of a built-in OscillatorNode and GainNode.
 * `` Verify that Filter, Delay, and Distortion nodes are correctly implemented using their corresponding built-in AudioNodes (BiquadFilterNode, DelayNode, WaveShaperNode).
 * `` Move all AudioWorkletProcessor code from inline template strings to separate static .js files in the /public directory.
 * `` Update AudioEngineService to load worklets from the new static files using addModule().
 * `` Remove all console.log statements from the process method of all AudioWorkletProcessor files.
Phase 4: Validation and Testing
 * `` Create a comprehensive test plan document that lists every file in the /examples directory.
 * `` For each example file, execute the frontend vs. backend comparison test.
 * `` Document all functional discrepancies in the test plan.
 * `` Create and resolve bug tickets for each documented discrepancy until functional parity is achieved.
