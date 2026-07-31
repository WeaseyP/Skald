import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    // The codegen CLI must live OUTSIDE app.asar: child_process.spawn cannot
    // execute a binary from the virtual asar path. This places it under
    // process.resourcesPath in packaged builds (see codegenExePath in main.ts).
    //
    // The example patches ship alongside it (as resources/examples) because
    // the Load / Save / Import dialogs open on that folder and every manual
    // chapter's "Try it" section names a patch inside it — a packaged build
    // without them sends the reader looking for files that were never
    // installed. See src/main/dialogDefaults.ts.
    //
    // ▲ The Odin COMPILER is deliberately NOT bundled here, and that is a
    // decision, not an oversight (SKB-057 / roadmap §3.12). The obvious fix —
    // add `'../.tools'` to this list — is worse than the bug: `.tools/` is
    // gitignored and only exists after scripts/setup-dev.ps1 has run, so on
    // any clean clone, CI runner, or release machine that skipped setup the
    // entry would silently produce a toolchain-less installer. That is the
    // exact failure mode being fixed, with the honest error swapped for a
    // packager that quietly no-ops. Bundling it would also ship a third-party
    // toolchain that measures 443MB / 3,195 files on this machine (Odin
    // dev-2025-02 plus its core+vendor library tree and LLVM-derived
    // binaries, with their own licence obligations) inside a Squirrel
    // installer, for a feature the user may never touch.
    //
    // Instead, a packaged install without a resolvable compiler says so, in
    // the app, at first launch AND on the first Play, naming SKALD_ODIN and
    // the download: see warnIfOdinMissing / odinMissingMessage in main.ts and
    // src/main/odinToolchain.ts. Should this be revisited, the resolver
    // ALREADY probes `<resourcesPath>/.tools/**/odin.exe` first in a packaged
    // build, so bundling becomes a one-line change here plus a package step
    // that guarantees the toolchain is present (and fails the build if not).
    extraResource: ['./skald_codegen.exe', '../examples'],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel(
      {
        name: 'Skald',
        authors: 'Ryan Parsons',
        description: 'Visual audio programming and Odin code generation for games',
      },
      ['win32'],
    ),
    new MakerZIP({}, ['win32']),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
