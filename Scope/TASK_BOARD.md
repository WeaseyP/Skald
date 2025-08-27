Skald Task Board

This document tracks the epics, user stories, and individual tasks for the Skald project.

Epic
	

User Story
	

TaskSKALD-E1: Backend CLI

As a developer, I want a CLI that transforms a JSON graph into valid Odin code.

~~SKALD-1: Define JSON schema.~~ <br> ~~SKALD-2: Implement stdin reader.~~ <br> ~~SKALD-3: Implement codegen for 'Oscillator'.~~ <br> ~~SKALD-4: Implement codegen for 'Filter'.~~ <br> ~~SKALD-5: Print result to stdout.~~ <br> ~~SKALD-22: Implement topological sort of the node graph.~~ <br> ~~SKALD-23: Refactor codegen to use port names.~~

SKALD-E2: UI Foundation

As a developer, I want a basic Electron/React application to host the visual editor.

~~SKALD-6: Set up Electron/TS/React project.~~ <br> ~~SKALD-7: Install & configure React Flow.~~ <br> ~~SKALD-8: Create main window layout.~~

SKALD-E3: Node Editor

As a user, I want to add, connect, and configure nodes to design my signal chain.

~~SKALD-9: Implement "Add Node" from a list.~~ <br> ~~SKALD-10: Implement node/edge deletion.~~ <br> ~~SKALD-11: Create parameter editing panel.~~

SKALD-E4: Integration

As a user, I want to click a button and see the generated Odin code.

~~SKALD-12: Implement state-to-JSON serialization.~~ <br> ~~SKALD-13: Create Node.js child process invoker.~~ <br> ~~SKALD-14: Create code preview panel.~~

SKALD-E5: Audio & I/O

As a user, I want to hear my graph and save my work.

~~SKALD-15: Build Web Audio graph interpreter.~~ <br> ~~SKALD-16: Add play/stop UI controls.~~ <br> ~~SKALD-17: Implement Save/Load file dialogs.~~

SKALD-E6: Advanced Sound Design & Dynamic Control (COMPLETED)

As a sound designer, I want more building blocks and control to create expressive instruments and effects.

~~SKALD-24: Implement ADSR Envelope node.~~ <br> ~~SKALD-25: Add Noise Generator node (White/Pink).~~ <br> ~~SKALD-26: Add Triangle and Square waves to Oscillator.~~ <br> ~~SKALD-27: Design and implement "Instrument" wrapper for polyphony.~~ <br> ~~SKALD-32: Add UI controls to "expose" a node parameter.~~ <br> ~~SKALD-33: Update JSON contract to include exposed_parameters.~~ <br> ~~SKALD-34: Update codegen to create public struct fields and set_ functions for exposed parameters.~~

SKALD-E7: Node Editor Polish (COMPLETED)

As a user, I want to manage multiple nodes at once to speed up my workflow.

~~SKALD-35: Implement marquee (drag-to-select) functionality.~~ <br> ~~SKALD-36: Implement deletion of all selected items via keyboard.~~

SKALD-E8: Advanced Node Implementation (Frontend) (COMPLETED)

As a power user, I want a complete suite of tools to create any sound I can imagine.

~~SKALD-41: Implement LFO Node (Frontend).~~ <br> ~~SKALD-42: Implement Random/Sample & Hold Node (Frontend).~~ <br> ~~SKALD-43: Implement Delay FX Node (Frontend).~~ <br> ~~SKALD-44: Implement Reverb FX Node (Frontend).~~ <br> ~~SKALD-45: Implement Distortion FX Node (Frontend).~~ <br> ~~SKALD-46: Implement Mixer Utility Node (Frontend).~~ <br> ~~SKALD-47: Implement Panner Utility Node (Frontend).~~ <br> ~~SKALD-48: Implement Node Grouping/Container feature (Frontend).~~ <br> ~~SKALD-49: Implement FM Operator Node (Frontend).~~ <br> ~~SKALD-50: Implement Wavetable Oscillator Node (Frontend).~~

SKALD-E9: UI/UX & Parameter Overhaul (Frontend) (COMPLETED)

As a sound designer, I want intuitive, context-aware controls to shape my sound with precision.

~~SKALD-62: Implement advanced parameter set in frontend state.~~ <br> ~~SKALD-63: Implement context-aware controls (Log/Expo sliders, ADSR editor, XY Pad).~~ <br> ~~SKALD-64: Implement core interaction polish (fine-tune, reset).~~ <br> ~~SKALD-65: Implement enhanced visual feedback and aesthetics.~~

SKALD-E10: Bug Squashing (COMPLETED)

As a user, I want the application to be stable and for controls to work as expected.

~~SKALD-66: Fix non-functional sliders.~~ <br> ~~SKALD-67: Restore Oscillator node to correct state.~~ <br> ~~SKALD-68: Conduct full regression testing.~~

SKALD-E10.5: Foundational Backend Refactor (COMPLETED)

As a developer, I want to refactor the backend for scalability and maintainability before adding new features.

~~SKALD-87: Modularize codegen into dedicated procedures per node type.~~ <br> ~~SKALD-88: Implement a sequencer-ready Note_Event system.~~ <br> ~~SKALD-89: Expand state management for all stateful nodes.~~ <br> ~~SKALD-90: Create a generic, type-safe parameter-fetching system.~~ <br> ~~SKALD-91: Update CONTRACT.md to reflect all backend changes.~~

SKALD-E11: Advanced Node Implementation (Backend) (COMPLETED)

As a developer, I want the backend to generate code for all advanced nodes.

~~SKALD-69: Implement Odin codegen for LFO and S&H.~~ <br> ~~SKALD-70: Implement Odin codegen for Delay, Reverb, and Distortion.~~ <br> ~~SKALD-71: Implement Odin codegen for Mixer and Panner.~~ <br> ~~SKALD-72: Implement Odin codegen for FM and Wavetable synthesis.~~

SKALD-E12: Advanced Parameter Implementation (Backend) (COMPLETED)

As a developer, I want the backend to support all new advanced parameters.

~~SKALD-73: Implement Odin codegen for new ADSR, Oscillator, and effects parameters.~~ <br> ~~SKALD-74: Implement Odin codegen for polyphony, glide, and unison.~~ <br> ~~SKALD-75: Update JSON contract in CONTRACT.md.~~

SKALD-E13: Ensuring all nodes work together


SKALD-E14: Beat Sequencer
	

As a musician, I want to arrange my custom sounds into a loop.
	

SKALD-76: Design and build the Sequencer UI panel. <br> SKALD-77: Implement BPM and transport controls. <br> SKALD-78: Create a "Sound Library" panel to manage instruments. <br> SKALD-79: Implement the note placement grid and playback logic.

SKALD-E15: Integration Kit & Exporting
	

As a game developer, I want a simple way to integrate Skald's code and export audio files.
	

SKALD-80: Refactor the tester directory into a documented integration_kit. <br> SKALD-81: Add CLI flags to skald_codegen for offline WAV export. <br> SKALD-82: Add an "Export to .wav" button and logic to the UI.

SKALD-E16: Web App
	

As an admin, I want to deploy Skald as a web service.
	

SKALD-83: Build Express.js server. <br> SKALD-84: Create /api/generate endpoint. <br> SKALD-85: Implement user authentication. <br> SKALD-86: Create Dockerfile for deployment.
