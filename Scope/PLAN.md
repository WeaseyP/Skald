Skald: A CodeGen Audio Tool for Odin
Technical Report and Implementation Plan v2.1
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
3.5. Visual Node Graph

The visual graph is the centerpiece of the UI. Implemented with React Flow, it will support standard interactions: node dragging, panning, zooming, and creating connections (edges) between node handles.
3.6. Code Generation Engine

The code generation engine is the Odin application. It's a focused tool that performs a single task perfectly. It will contain parsers for the JSON structure, logic for topologically sorting the graph to ensure correct processing order, and a set of templates or builders for generating the Odin code for each supported node type. It does not contain any UI, audio, or state management logic.
4. Key Features

    Visual Node Graph Editor: Implemented using the React Flow library within the React/Electron application.

    Extensive Node Library: Node definitions and their corresponding code generation logic will be managed primarily in the Odin backend.

    Real-time Parameter Editing: A dedicated React component will display the parameters for the currently selected node.

    Instant Audio Preview: A service within the React application will translate the React Flow graph into a corresponding Web Audio API graph.

    One-Click Code Generation: A "Generate Code" button in the UI triggers the stdin/stdout communication process with the backend Odin CLI.

    Project Management: The Electron frontend will use Node.js's fs module to handle saving and loading the graph state.

5. Implementation Plan

The project is executed in a series of focused phases.

    Phase 1-9: (COMPLETED)

    Phase 10: Bug Squashing (Current Phase)

        Goal: Identify and resolve critical bugs to improve stability and user experience.

        Tasks: Fix non-functional sliders, restore Oscillator node, and perform comprehensive regression testing.

    Phase 10.5: Foundational Backend Refactor

        Goal: Address critical architectural flaws in the Odin backend to ensure the codebase is scalable, maintainable, and correct before implementing new features.

        Task A: Modularize Code Generation: Refactor the monolithic process_sample switch statement into smaller, dedicated procedures for each node type.

        Task B: Implement a Sequencer-Ready Event System: Replace the simple gate: bool with a robust event system (events: []Note_Event) to handle note-on/note-off messages for a future sequencer.

        Task C: Expand State Management: Update collect_stateful_nodes and the AudioProcessor struct to include all new stateful nodes (e.g., Filter, LFO, Delay, Reverb).

        Task D: Create a Generic Parameter-Fetching System: Replace the hardcoded get_param_value_str helper with a set of type-safe procedures for fetching parameters of different types (f32, string, bool).

        Task E: Update JSON Contract: Ensure CONTRACT.md is updated to reflect all new nodes, parameters, and data structures.

    Phase 11: Advanced Node Implementation (Backend)

        Goal: Implement the Odin codegen logic for the advanced nodes introduced in Phase 8.

    Phase 12: Advanced Parameter & Control Implementation (Backend)

        Goal: Implement the Odin codegen logic for the new parameters and UI controls from Phase 9.

    Phase 13: Beat Sequencer

        Goal: Allow users to arrange their created instruments into a looping musical pattern.

    Phase 14: Integration Kit & Offline Export

        Goal: Refine the existing test harness into a polished "Integration Kit" and add a direct-to-file export option.

    Phase 15: Web Application Deployment (Future Goal)

        Goal: Deploy Skald as a web service.

6. Build and Deployment Strategy

The decoupled architecture necessitates two distinct build and deployment pipelines for the desktop and future web applications.
7. Future Considerations

The architecture is designed to be extensible, allowing for features like a plugin system and cloud synchronization.
8. Conclusion and Strategic Recommendations

    Embrace the Decoupling: Development teams for the frontend and backend can work in parallel.

    Prioritize the Desktop Experience: The immediate goal is to deliver a polished, feature-complete desktop application.

    Plan for the Web: The technology choices ensure that the majority of the frontend codebase is directly reusable for a future web application.