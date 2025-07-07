Skald: A CodeGen Audio Tool for Odin
Technical Report and Implementation Plan v2.0


1. Introduction

Skald is a visual, node-based development tool designed to accelerate the creation of complex audio processing graphs for the Odin programming language. The project's core vision is to provide audio engineers, game developers, and creative coders with an intuitive graphical interface to design, prototype, and generate high-performance, boilerplate-free Odin audio code.

This document outlines the technical architecture for Skald. The project is architected as a decoupled system within a single monorepo, comprising a modern desktop frontend and a focused, headless backend.

2. Rationale for Technology Selection

The choice of technologies for Skald is driven by a strategy that plays to the strengths of each component, optimizing for user experience, development speed, and code generation robustness.
2.1. Odin for Headless Code Generation Engine

Odin remains the ideal choice for the core code generation engine, but its role has been focused into a small, headless command-line interface (CLI) tool. This approach leverages Odin's key strengths:

    Performance: The Odin compiler produces highly optimized, native binaries, ensuring that the code generation process is nearly instantaneous, even for large and complex audio graphs.

    Low-Level Control: Direct memory management and a clear, explicit syntax give us precise control over the structure and quality of the generated code.

    AST Manipulation: Odin's robust metaprogramming and introspection capabilities are critical. The ability to natively parse and manipulate Abstract Syntax Trees (AST) allows the codegen engine to perform complex, context-aware code construction, ensuring the output is not just text but is syntactically correct and idiomatic Odin code.

2.2. Electron, TypeScript, and React for User Interface

For the graphical user interface (GUI), we have selected a modern web technology stack, which offers significant advantages over native UI toolkits for this application.

    Rapid Development: The vast ecosystem of libraries, tools, and community support for React and TypeScript dramatically accelerates the development lifecycle.

    Superior UI/UX: HTML and CSS provide unparalleled control over layout, styling, and responsiveness, enabling the creation of a polished, modern, and aesthetically pleasing user interface that is difficult to achieve with traditional immediate-mode GUI libraries.

    Purpose-Built Libraries: The availability of mature, specialized libraries is a key factor. React Flow is a feature-rich, production-ready library specifically designed for building node-based editors. Leveraging it saves thousands of hours of development time and provides a robust foundation for our core UI.

2.3. Web Audio API for Real-time Audio Preview

The Web Audio API, a standard feature in all modern browsers (and thus in Electron), provides the audio processing backend for the frontend application.

    Fast, Interactive Prototyping: It enables real-time audio synthesis and processing directly within the UI. This allows users to hear an approximation of their graph's output instantly as they connect nodes and tweak parameters, providing a tight feedback loop for creative exploration.

    Cross-Platform Consistency: The API works identically across Windows, macOS, and Linux. This simplifies development and ensures a consistent user experience.

    Future-Proofing: By using a browser-native API, the entire audio previewing system is immediately portable to the future web application version of Skald with no modification required.

3. Core Concepts and Architecture
3.1. Project Philosophy

    Visual First: The primary mode of interaction is the visual graph.

    Immediate Feedback: Users should see and hear changes instantly.

    Clean Code Output: The generated code must be clean, readable, and performant.

3.2. User Experience Flow

    Construct: The user adds and connects audio nodes (oscillators, filters, effects) on a canvas.

    Configure: The user selects nodes to edit their parameters in a dedicated panel.

    Preview: The user clicks a "Play" button to hear a real-time approximation of the audio output via the Web Audio API.

    Generate: The user clicks "Generate Code." The application converts the visual graph into a JSON structure.

    Compile: The JSON is passed to the Odin CLI, which generates the corresponding Odin source code.

    Integrate: The user copies the generated code into their Odin project.

3.3. Software Architecture

The Skald application is composed of two distinct processes that communicate via a well-defined contract.

    Frontend (Electron/React Application): This is the user-facing application. Its responsibilities include:

        Rendering the entire graphical user interface, including the node editor, parameter panels, and menus.

        Managing the state of the audio graph using React Flow.

        Implementing the audio preview system using the Web Audio API.

        Serializing the graph state into a JSON object.

        Invoking the backend CLI process and capturing its output.

        Displaying the generated code to the user.

        Handling project file I/O (saving/loading the graph as a .json file).

    Backend (Odin CLI - skald_codegen): This is a headless, stateless command-line tool. Its sole responsibility is:

        To read a JSON string representing an audio graph from its standard input (stdin).

        To parse this JSON and build an internal representation of the graph.

        To traverse the graph and generate valid, high-performance Odin source code.

        To print the generated source code to its standard output (stdout).

3.3.1. Frontend-Backend Communication

The contract between the two components is simple and robust, relying on standard inter-process communication:

    Invocation: The Electron application spawns the skald_codegen executable as a child process.

    Data Transfer (Write): The frontend serializes the React Flow graph state into a JSON string. This string is then written to the stdin stream of the skald_codegen process.

    Data Transfer (Read): The frontend listens to the stdout stream of the skald_codegen process. The Odin tool performs its code generation and prints the resulting Odin code to stdout. The frontend reads this stream until it closes.

    Error Handling: Any errors encountered by the Odin CLI (e.g., malformed JSON, invalid graph logic) will be written to stderr. The frontend will listen to this stream and display any error messages to the user in a modal or notification panel.

3.4. Key Data Structures

The primary data structure is the audio graph, which will be defined as a set of TypeScript interfaces in the frontend. This same structure is serialized to JSON to be consumed by the Odin backend.

      
// Example TypeScript interfaces defining the JSON contract

// This interface is a good representation of the data within React Flow,
// but it will be transformed before being sent to the Odin CLI.
interface ReactFlowNode {
  id: string; // React Flow typically uses strings
  type: string;
  position: { x: number; y: number };
  data: {
    parameters: { [key: string]: string | number | boolean };
  };
}

// --- Official Skald JSON Contract Interfaces ---
// This is the structure that will be generated and sent to stdin.

interface SkaldNode {
  id: number; // The Odin backend expects an Integer
  type: string;
  position: { x: number; y: number };
  parameters: { [key: string]: string | number | boolean }; // A simple key-value object
}

interface SkaldConnection {
  from_node: number; // The Odin backend expects an Integer
  from_port: string;
  to_node: number;   // The Odin backend expects an Integer
  to_port: string;
}

interface AudioGraph {
  nodes: SkaldNode[];
  connections: SkaldConnection[];
}

    

IGNORE_WHEN_COPYING_START
Use code with caution. TypeScript
IGNORE_WHEN_COPYING_END
3.5. Visual Node Graph

The visual graph is the centerpiece of the UI. Implemented with React Flow, it will support standard interactions: node dragging, panning, zooming, and creating connections (edges) between node handles.
3.6. Code Generation Engine

The code generation engine is the Odin application. It's a focused tool that performs a single task perfectly. It will contain parsers for the JSON structure, logic for topologically sorting the graph to ensure correct processing order, and a set of templates or builders for generating the Odin code for each supported node type. It does not contain any UI, audio, or state management logic.

4. Key Features

The core feature set remains unchanged, but their implementation is now mapped to the new architecture.

    Visual Node Graph Editor: Implemented using the React Flow library within the React/Electron application. This provides a professional-grade canvas for all node-based interactions.

    Extensive Node Library: Node definitions and their corresponding code generation logic will be managed primarily in the Odin backend. The frontend will fetch a manifest of available nodes to populate the UI.

    Real-time Parameter Editing: A dedicated React component will display the parameters for the currently selected node. State changes will be managed by React's state hooks.

    Instant Audio Preview: A service within the React application will translate the React Flow graph into a corresponding Web Audio API graph, enabling real-time playback.

    One-Click Code Generation: A "Generate Code" button in the UI triggers the stdin/stdout communication process with the backend Odin CLI. The resulting code is displayed in a read-only code viewer component with a "Copy to Clipboard" feature.

    Project Management: The Electron frontend will use Node.js's fs module to handle saving and loading the graph state to and from the local filesystem as a .json file.

5. Implementation Plan

The project is executed in a series of focused phases.

    Phase 1: Odin CodeGen CLI Foundation (COMPLETED)

        Define the canonical graph.json format.

        Create the skald_codegen Odin project.

        Implement logic to read a hardcoded graph.json file from disk.

        Implement the core codegen logic for a few basic nodes (e.g., Sine Oscillator, Gain, Output).

        Refactor to read from stdin and write to stdout.

        Write unit tests to validate output for sample JSON inputs.

    Phase 2: Electron & React UI Foundation (COMPLETED)

        Set up a new project with Electron Forge, using the Vite and TypeScript template.

        Install and configure React and the reactflow library.

        Create the main application layout consisting of a full-screen canvas.

        Render a basic, empty React Flow canvas on application start.

    Phase 3: Interactive Node Editor (COMPLETED)

        Implement UI logic for adding new nodes to the canvas from a library panel.

        Enable connecting, moving, and deleting nodes and edges.

        Create the parameter editing panel, which dynamically displays controls for the selected node.

        Ensure all graph state changes are captured correctly in the React Flow state object.

    Phase 4: Frontend-Backend Integration (COMPLETED)

        Implement the "Generate Code" button logic.

        Add the function to serialize the React Flow state into the agreed-upon JSON format.

        Write the Node.js logic to invoke skald_codegen, pipe the JSON to its stdin, and capture its stdout and stderr.

        Create a code preview component to display the captured output.

        Implement a "Copy to Clipboard" button for the generated code.

    Phase 5: Audio Preview & Project I/O (COMPLETED)

        Develop a "Graph Interpreter" service that maps the React Flow state to a Web Audio API node graph.

        Implement play/stop controls that connect/disconnect the generated Web Audio graph from the destination.

        Implement "Save" and "Load" menu items that use Electron's dialogs to read/write the graph's JSON state to a file.

Phase 6: Advanced Sound Design & Dynamic Control (COMPLETED)

    Goal: Expand the node library to create more expressive sounds and allow them to be controlled dynamically by an external application or game engine.

    Task 1: Implement ADSR Envelope Node: Create an Attack, Decay, Sustain, Release (ADSR) envelope generator to control the volume of a sound over time.

    Task 2: Implement Noise Generator Node: Add a white/pink noise generator as a fundamental building block for synthesizing percussive sounds and effects.

    Task 3: Implement Additional Oscillator Types: Add Triangle and Square waves to the Oscillator node.

    Task 4: Implement a Polyphonic Instrument Wrapper: Design a meta-node or concept where a user can save a node graph as a playable "Instrument" capable of polyphony.

    Task 5: Implement Parameter Exposure API: Create the functionality to expose node parameters to the generated Odin code's top-level API for real-time control.

Phase 7: Node Editor Polish (COMPLETED)

    Goal: Improve the core user experience of the node graph editor with essential workflow enhancements.

    Task 1: Implement Multi-Select: Add and verify support for marquee (click-and-drag) selection and shift-click selection of multiple nodes and edges.

    Task 2: Implement Multi-Delete: Implement the logic to delete all selected items when the user presses the Delete or Backspace key.

Phase 8: Advanced Node Implementation (Frontend) (COMPLETED)

    Goal: Substantially expand Skald's creative potential by introducing advanced modulation, effects, and synthesis methods (Frontend Only).

    Task 1: Add Advanced Modulation Sources (Frontend): Implement frontend components for LFO and Random / Sample & Hold nodes.

    Task 2: Add Core Audio Effects (Frontend): Implement frontend components for Delay, Reverb, and Distortion/Overdrive nodes.

    Task 3: Add Utility & Logic Nodes (Frontend): Implement frontend components for Mixer and Panner nodes.

    Task 4: Add Workflow Enhancements (Frontend): Implement frontend components for Groups/Containers to collapse complex patches.

    Task 5: Add Advanced Synthesis Methods (Frontend): Implement frontend components for FM Operator and Wavetable Oscillator nodes.

Phase 9: UI/UX & Parameter Overhaul (Frontend) (COMPLETED)

    Goal: Evolve the user interface from merely functional to truly intuitive and professional by implementing context-aware controls and expanding the parameter set for deep, expressive sound design.

    Task 1: Advanced Parameter Implementation (Frontend): Integrate the full suite of proposed parameters into the frontend state (ADSR Amount, Velocity Sensitivity, Oscillator Pulse Width, Wet/Dry Mixes, etc.).

    Task 2: Context-Aware UI Controls: Replace generic sliders with specialized controls like Logarithmic/Exponential Sliders, a Graphical ADSR Envelope Editor, and an X/Y Pad for filters.

    Task 3: Core Interaction Polish: Implement modifier keys for fine-grained control (Shift+Drag), shortcuts to reset parameters (Double-Click), and smart text input parsing.

    Task 4: Visual Feedback & Aesthetics: Enhance the UI with visual indicators for modulation, a redesigned node appearance, and animated feedback for audio output.

Phase 10: Bug Squashing (Current Phase)

    Goal: Identify and resolve critical bugs to improve stability and user experience.

    Task 1: Fix Non-Functional Sliders: Investigate and resolve the issue preventing sliders from being adjusted. The UI should update correctly when a slider is moved.

    Task 2: Restore Oscillator Node: The Oscillator node's UI and functionality have diverged from their intended design. Revert the component to its correct state.

    Task 3: Comprehensive Testing: Perform a full regression test of all completed features to identify, document, and prioritize any further issues.

Phase 11: Advanced Node Implementation (Backend)

    Goal: Implement the Odin codegen logic for the advanced nodes introduced in Phase 8.

    Task 1: Codegen for Modulation Sources: Implement backend logic for LFO and Sample & Hold nodes.

    Task 2: Codegen for Audio Effects: Implement backend logic for Delay, Reverb, and Distortion nodes.

    Task 3: Codegen for Utility Nodes: Implement backend logic for Mixer and Panner nodes.

    Task 4: Codegen for Advanced Synthesis: Implement backend logic for FM Operator and Wavetable Oscillator nodes.

Phase 12: Advanced Parameter & Control Implementation (Backend)

    Goal: Implement the Odin codegen logic for the new parameters and UI controls from Phase 9.

    Task 1: Implement New Parameter Logic: Update Odin codegen to handle ADSR Amount/Depth, Velocity Sensitivity, Pulse Width, Phase, Wet/Dry Mix, BPM Sync, and Polyphony parameters (Voice Count, Glide, Unison).

    Task 2: Implement Control Data Mapping: Ensure the backend correctly interprets data from new frontend controls (e.g., X/Y Pad outputting cutoff and resonance).

    Task 3: Update JSON Contract: Formally update `CONTRACT.md` to reflect all new parameters and data structures.

Phase 13: Beat Sequencer

    Goal: Allow users to arrange their created instruments into a looping musical pattern.

    Task 1: Design Sequencer UI Panel: Create a new UI view featuring a step-sequencer grid.

    Task 2: Implement Transport and BPM Controls: Add UI for setting Beats Per Minute (BPM) and global play/stop controls.

    Task 3: Create a "Sound Library" Panel: Implement a panel where users can manage their saved Instruments.

    Task 4: Implement Grid Logic: The grid will allow users to place notes for their selected sound at different time intervals.

Phase 14: Integration Kit & Offline Export

    Goal: Refine the existing test harness into a polished "Integration Kit" to make using the generated code seamless and add a direct-to-file export option for creating static assets.

    Task 1: Refactor Test Harness: Clean up and rename the existing tester directory and its contents to serve as a clear, minimal starter kit.

    Task 2: Create Integration Guide: Write a simple README.md in the integration kit's directory explaining how to use the generated audio.odin file in a new project.

    Task 3: Implement WAV Export: Enhance the Odin backend with command-line flags (e.g., --output sound.wav) to run in an offline mode.

    Task 4: Add Export Button to UI: Create an "Export to .wav" button in the frontend that invokes the backend with the new flags.

Phase 15: Web Application Deployment (Future Goal)

    Task 1: Server Scaffolding: Create a Node.js/Express.js server.

    Task 2: API Endpoint: Create a /api/generate endpoint.

    Task 3: CLI Wrapper: The endpoint handler will invoke the pre-compiled Linux binary of skald_codegen.

    Task 4: Authentication: Implement a user authentication layer.

    Task 5: Deployment Strategy: Define a Dockerfile for deployment.

6. Storyboard

Epic
	

User Story
	

Task

SKALD-E1: Backend CLI
	

As a developer, I want a CLI that transforms a JSON graph into valid Odin code.
	

~~SKALD-1: Define JSON schema.~~ 
 ~~SKALD-2: Implement stdin reader.~~ 
 ~~SKALD-3: Implement codegen for 'Oscillator'.~~ 
 ~~SKALD-4: Implement codegen for 'Filter'.~~ 
 ~~SKALD-5: Print result to stdout.~~ 
 ~~SKALD-22: Implement topological sort of the node graph.~~ 
 ~~SKALD-23: Refactor codegen to use port names.~~

SKALD-E2: UI Foundation
	

As a developer, I want a basic Electron/React application to host the visual editor.
	

~~SKALD-6: Set up Electron/TS/React project.~~ 
 ~~SKALD-7: Install & configure React Flow.~~ 
 ~~SKALD-8: Create main window layout.~~

SKALD-E3: Node Editor
	

As a user, I want to add, connect, and configure nodes to design my signal chain.
	

~~SKALD-9: Implement "Add Node" from a list.~~ 
 ~~SKALD-10: Implement node/edge deletion.~~ 
 ~~SKALD-11: Create parameter editing panel.~~

SKALD-E4: Integration
	

As a user, I want to click a button and see the generated Odin code.
	

~~SKALD-12: Implement state-to-JSON serialization.~~ 
 ~~SKALD-13: Create Node.js child process invoker.~~ 
 ~~SKALD-14: Create code preview panel.~~

SKALD-E5: Audio & I/O
	

As a user, I want to hear my graph and save my work.
	

~~SKALD-15: Build Web Audio graph interpreter.~~
~~SKALD-16: Add play/stop UI controls.~~
~~SKALD-17: Implement Save/Load file dialogs.~~

SKALD-E6: Advanced Sound Design & Dynamic Control (COMPLETED)

    As a sound designer, I want more building blocks and control to create expressive instruments and effects.

    ~~SKALD-24: Implement ADSR Envelope node.~~
    ~~SKALD-25: Add Noise Generator node (White/Pink).~~
    ~~SKALD-26: Add Triangle and Square waves to Oscillator.~~
    ~~SKALD-27: Design and implement "Instrument" wrapper for polyphony.~~
    ~~SKALD-32: Add UI controls to "expose" a node parameter.~~
    ~~SKALD-33: Update JSON contract to include exposed_parameters.~~
    ~~SKALD-34: Update codegen to create public struct fields and set_ functions for exposed parameters.~~

SKALD-E7: Node Editor Polish (COMPLETED)

    As a user, I want to manage multiple nodes at once to speed up my workflow.

    ~~SKALD-35: Implement marquee (drag-to-select) functionality.~~
    ~~SKALD-36: Implement deletion of all selected items via keyboard.~~

SKALD-E8: Advanced Node Implementation (Frontend) (COMPLETED)

    As a power user, I want a complete suite of tools to create any sound I can imagine.

    ~~SKALD-41: Implement LFO Node (Frontend).~~
    ~~SKALD-42: Implement Random/Sample & Hold Node (Frontend).~~
    ~~SKALD-43: Implement Delay FX Node (Frontend).~~
    ~~SKALD-44: Implement Reverb FX Node (Frontend).~~
    ~~SKALD-45: Implement Distortion FX Node (Frontend).~~
    ~~SKALD-46: Implement Mixer Utility Node (Frontend).~~
    ~~SKALD-47: Implement Panner Utility Node (Frontend).~~
    ~~SKALD-48: Implement Node Grouping/Container feature (Frontend).~~
    ~~SKALD-49: Implement FM Operator Node (Frontend).~~
    ~~SKALD-50: Implement Wavetable Oscillator Node (Frontend).~~

SKALD-E9: UI/UX & Parameter Overhaul (Frontend) (COMPLETED)

    As a sound designer, I want intuitive, context-aware controls to shape my sound with precision.

    ~~SKALD-62: Implement advanced parameter set in frontend state.~~
    ~~SKALD-63: Implement context-aware controls (Log/Expo sliders, ADSR editor, XY Pad).~~
    ~~SKALD-64: Implement core interaction polish (fine-tune, reset).~~
    ~~SKALD-65: Implement enhanced visual feedback and aesthetics.~~

SKALD-E10: Bug Squashing (Current Epic)

    As a user, I want the application to be stable and for controls to work as expected.

    SKALD-66: Fix non-functional sliders.
    SKALD-67: Restore Oscillator node to correct state.
    SKALD-68: Conduct full regression testing.

SKALD-E11: Advanced Node Implementation (Backend)

    As a developer, I want the backend to generate code for all advanced nodes.

    SKALD-69: Implement Odin codegen for LFO and S&H.
    SKALD-70: Implement Odin codegen for Delay, Reverb, and Distortion.
    SKALD-71: Implement Odin codegen for Mixer and Panner.
    SKALD-72: Implement Odin codegen for FM and Wavetable synthesis.

SKALD-E12: Advanced Parameter Implementation (Backend)

    As a developer, I want the backend to support all new advanced parameters.

    SKALD-73: Implement Odin codegen for new ADSR, Oscillator, and effects parameters.
    SKALD-74: Implement Odin codegen for polyphony, glide, and unison.
    SKALD-75: Update JSON contract in `CONTRACT.md`.

SKALD-E13: Beat Sequencer

    As a musician, I want to arrange my custom sounds into a loop.

    SKALD-76: Design and build the Sequencer UI panel.
    SKALD-77: Implement BPM and transport controls.
    SKALD-78: Create a "Sound Library" panel to manage instruments.
    SKALD-79: Implement the note placement grid and playback logic.

SKALD-E14: Integration Kit & Exporting

    As a game developer, I want a simple way to integrate Skald's code and export audio files.

    SKALD-80: Refactor the tester directory into a documented integration_kit.
    SKALD-81: Add CLI flags to skald_codegen for offline WAV export.
    SKALD-82: Add an "Export to .wav" button and logic to the UI.

SKALD-E15: Web App

    As an admin, I want to deploy Skald as a web service.

    SKALD-83: Build Express.js server.
    SKALD-84: Create /api/generate endpoint.
    SKALD-85: Implement user authentication.
    SKALD-86: Create Dockerfile for deployment.

7. Build and Deployment Strategy

The decoupled architecture necessitates two distinct build and deployment pipelines.

Desktop Application
The desktop application will be bundled into standard OS-specific installers (e.g., .dmg for macOS, .exe for Windows, .deb/.AppImage for Linux).

    Backend Compilation: The skald_codegen Odin tool will be compiled separately for each target platform (windows-amd64, darwin-amd64, linux-amd64).

    Frontend Build: The React/TypeScript project will be built into static HTML/CSS/JS assets.

    Packaging: The electron-builder tool will be configured to package the frontend assets and automatically include the correct compiled Odin binary from step 1 based on the build target. The final output is a single, self-contained distributable application.

Web Application (Future)
The web application will be deployed as a containerized service to a cloud provider.

    Backend Compilation: A single skald_codegen binary will be compiled for the linux-amd64 target, as this is the standard for most Docker containers.

    Frontend Build: The React application will be built into a directory of static assets (build or dist).

    Containerization: A Dockerfile will be created with a Node.js base image. It will:

        Copy the Node.js/Express server code.

        Copy the compiled Linux Odin binary into the container's path (e.g., /usr/local/bin).

        Copy the static frontend build assets.

        Install Node.js dependencies (npm install).

        Expose the necessary port and define the command to start the server.

    Deployment: This container image will be pushed to a registry (e.g., Docker Hub, ECR) and deployed to a managed container service.

8. Future Considerations

This architecture is highly extensible. Future enhancements can be integrated smoothly.

    Extensibility: A plugin system can be developed where users or third parties can contribute new nodes. This could be achieved by publishing NPM packages that contain both the React component for the node and a JSON definition of its parameters, which the Odin backend can then use for code generation.

    Cloud Synchronization: User projects (the graph .json files) could be synchronized across devices by storing them in a cloud database (e.g., Firestore) linked to their user account.

    CI/CD: Automation pipelines can be established to trigger builds, run tests, and deploy both the desktop and web applications upon commits to the main branch.

9. Conclusion and Strategic Recommendations

The architecture is highly extensible. The addition of advanced sound design nodes and a beat sequencer transforms Skald from a code utility into a comprehensive creative tool. This enhances its value proposition significantly.

Strategic Recommendations:

    Embrace the Decoupling: Development teams for the frontend and backend can work in parallel with minimal friction, as the JSON contract is their only point of integration.

    Prioritize the Desktop Experience: The immediate goal is to deliver a polished, feature-complete desktop application with robust sound design and sequencing capabilities. This provides the most value to users in the short term.

    Plan for the Web: The choice of Electron, React, and the Web Audio API ensures that the majority of the frontend codebase is directly reusable for the future web application. This "start with desktop, plan for web" approach is both efficient and forward-thinking, positioning Skald for long-term success and accessibility.