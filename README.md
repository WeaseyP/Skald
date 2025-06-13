# Skald: A CodeGen Audio Tool for Odin

Skald is a visual, node-based development tool designed to accelerate the creation of complex audio processing graphs for the Odin programming language.

## Architecture

This project is architected as a decoupled system:

*   **Frontend**: A modern desktop application built with Electron, TypeScript, and React. The source code is located in the `skald-ui` repository.
*   **Backend (This Repository)**: A headless, command-line Odin application (`skald_codegen`) that functions as a pure code generation engine.

The two components communicate via a simple contract: the frontend passes a `JSON` representation of the audio graph to the backend's `stdin`, and the backend prints the generated Odin code to `stdout`.

## Getting Started

This repository contains the backend Odin CLI (`skald_codegen`).

### Prerequisites

*   [Odin Compiler](https://odin-lang.org/) installed and available in your `PATH`.

### Build and Run

A simple build script is provided. It compiles the Odin code and immediately runs it, piping the contents of `graph.json` as input.

```bash
# On Windows
.\build.bat

# On Linux/macOS
# ./build.sh