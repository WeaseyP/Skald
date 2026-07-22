# Releasing Skald

Skald uses Semantic Versioning and ships Windows-first preview releases. Before 1.0, minor versions may contain breaking project-file or generated-code changes.

## Prerequisites

- Windows 10 or newer
- Git
- Node.js 22
- Odin dev-2025-02
- Windows C++ build tools required by Electron dependencies

The repository setup script installs Odin into the ignored .tools directory. It does not modify the system-wide PATH or require administrator access.

~~~powershell
.\scripts\setup-dev.ps1
~~~

## Build and verify locally

Commit the intended release changes first, then run this from the repository root:

~~~powershell
.\scripts\build-release.ps1
~~~

The script refuses a dirty worktree by default. It runs the backend acceptance and golden suites, UI lint, typecheck and tests, then creates the Squirrel installer and portable ZIP. Upload-ready files and SHA-256 checksums are assembled under release/vX.Y.Z/windows-x64.

For verification before committing release-preparation changes, use -AllowDirty. Use -SkipInstall only when node_modules already exactly matches package-lock.json.

## Publish a release

1. Confirm package.json, CHANGELOG.md, and docs/releases/vX.Y.Z.md use the same version.
2. Run the clean local release build.
3. Push the release commit and wait for CI.
4. Create and push an annotated tag:

~~~powershell
git tag -a v0.1.0 -m "Skald v0.1.0"
git push origin review-fixes
git push origin v0.1.0
~~~

The tag workflow repeats every release gate and creates a draft GitHub prerelease with the installer, portable ZIP, Squirrel metadata, and checksums. Review the draft and publish it manually.

Never move or reuse a published version tag. Fix a release with a new patch version.

## v0.1 limitations

- Windows x64 is the supported packaged target.
- Binaries are unsigned, so Windows SmartScreen may warn.
- The default Electron icon is used until Skald has finalized icon artwork.
- Odin is bundled into the developer setup, not the application. Live preview uses the bundled code generator; extending or rebuilding the backend requires Odin.
