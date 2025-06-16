# Skald: A CodeGen Audio Tool for Odin

Skald is a visual, node-based development tool designed to accelerate the creation of complex audio processing graphs for the Odin programming language. Users can visually construct signal chains, manipulate parameters, and instantly generate high-performance, boilerplate-free Odin audio code.

This repository is a **monorepo** containing the complete Skald application, which consists of two main parts: a frontend user interface and a backend code generation engine.

---

## Architecture

The project is architected as a decoupled system with two primary components that live in this repository:

* `skald-ui/`: A modern desktop application built with **Electron**, **TypeScript**, and **React**. This provides the visual node graph editor, parameter panels, and all other user-facing elements.
* `skald-backend/`: A headless, command-line **Odin** application (`skald_codegen`) that functions as a pure code generation engine.

[cite_start]The two components communicate via a simple contract [cite: 1, 3][cite_start]: the frontend UI serializes the visual graph into a specific JSON format and passes it to the backend's standard input (`stdin`)[cite: 1, 4, 9, 76]. [cite_start]The backend then parses this JSON, generates the corresponding Odin code, and prints it to standard output (`stdout`), which the frontend captures and displays[cite: 1, 4, 79].

---

## Getting Started

### Prerequisites

To build and run this project, you will need both **Node.js** for the UI and the **Odin Compiler** for the backend.

1.  **Node.js**: [Install Node.js](httpss://nodejs.org/en) (which includes `npm`).
2.  [cite_start]**Odin Compiler**: [Install Odin](httpss://odin-lang.org/docs/install/) and ensure it is available in your system's `PATH`[cite: 6].

### Installation & Setup

The development workflow is managed through the UI project's `package.json`. The setup process compiles the backend automatically.

```bash
# 1. Clone the repository
git clone <your-repository-url>
cd skald

# 2. Navigate into the UI directory
cd skald-ui

# 3. Install the UI's dependencies
npm install
```

---

## Development Workflow

### Running the Application

The entire application is launched from the `skald-ui` directory. The `prestart` script will automatically build the latest version of the Odin backend before launching the Electron app.

```bash
# From within the skald-ui/ directory:
npm start
```

This command will:
1.  Automatically compile the Odin CLI in `skald-backend/`.
2.  Place the `skald_codegen.exe` into the `skald-ui/` folder where Electron can find it.
3.  Launch the Skald UI application in development mode with hot-reloading.

### Testing the Backend

If you want to run the backend's audio test harness separately, you can use the dedicated test script. This script requires you to have first generated code from the UI and copied it to `skald-backend/tester/generated_audio/audio.odin`.

```bash
# From within the skald-backend/ directory:
# On Windows
.\build_and_test.bat

# On Linux/macOS
# ./build_and_test.sh  (Note: you would need to create this script)
```

## Project Structure

The monorepo is organized as follows:

```
/
├── skald-backend/      # The Odin command-line code generation engine.
├── skald-ui/           # The Electron/React frontend application.
└── Scope/              # Project planning and contract documents.
```
