---
created: 2026-06-03T16:08:02+0200
Story Key: 3-1-cross-compiled-release-pipeline-with-checksums
baseline_commit: 189b6c5bb57a9d9b967a56cc7dc599747c2e276c
---

# Story 3.1: Cross-compiled release pipeline with checksums

Status: done

## Story

As the plugin maintainer,
I want CI to cross-compile per-platform binaries with checksums on each tagged release,
so that users can install a prebuilt binary with no runtime toolchain.

## Acceptance Criteria

1. Given a tagged release, when `.github/workflows/release.yml` runs on a single CI runner, then Bun compiles the server into prebuilt binaries for Linux x64, Linux arm64, Linux x64 musl, Linux arm64 musl, macOS x64, and macOS arm64.
2. Each binary is produced with the frontend bundled into the server distribution path expected by the architecture, so users do not need Node, yarn, Bun, system Graphviz, or loose frontend build assets at runtime.
3. The release pipeline generates a SHA-256 manifest for every emitted binary, using stable artifact names that Story 3.2 can map from platform/libc detection.
4. The binaries and checksum manifest are published to the GitHub Release for the exact tag that triggered the workflow.
5. No Windows prebuilt artifact is produced in v1; Windows and other uncovered platforms remain covered by the source-build fallback story.
6. The pipeline fails closed: missing binaries, checksum mismatches, a missing tag, or an attempted publish without release permissions must fail the workflow instead of publishing a partial release.
7. The release process preserves the architecture's in-source checksum requirement: the manifest used by installers is committed or explicitly validated against a committed root `checksums.txt` before publishing tagged assets.

## Tasks / Subtasks

- [x] Replace the release workflow placeholder with a real release pipeline (AC: 1, 4, 6)
  - [x] Update `.github/workflows/release.yml`; do not add a second release workflow with a divergent name or trigger.
  - [x] Trigger on pushed version tags such as `v*` and keep `workflow_dispatch` only if it is useful for dry-run or manifest-preparation mode.
  - [x] Run on a single `ubuntu-latest` runner with `actions/checkout@v4` and `oven-sh/setup-bun@v2`.
  - [x] Set minimal permissions required for release publishing, including `contents: write`.
  - [x] Use `gh release create "$GITHUB_REF_NAME" ... --verify-tag` or an equivalently tag-pinned GitHub release upload path; never publish against `latest`.
- [x] Build frontend assets before compiling the server binary (AC: 2)
  - [x] Use the existing Bun frontend build path, currently smoke-tested as `bun build frontend/index.html --outdir dist/frontend`.
  - [x] Ensure the compiled server can locate or embed the bundled frontend according to the architecture's single-file distribution goal.
  - [x] Do not introduce a runtime Node/yarn/Bun dependency to serve frontend assets.
- [x] Cross-compile all v1 prebuilt binaries with stable names (AC: 1, 3, 5)
  - [x] Compile `server/server.ts` with Bun `--compile`.
  - [x] Emit these exact artifact basenames unless a documented install mapping is updated with the same names: `server-linux-x64`, `server-linux-arm64`, `server-linux-x64-musl`, `server-linux-arm64-musl`, `server-darwin-x64`, `server-darwin-arm64`.
  - [x] Use Bun targets matching those names: `bun-linux-x64`, `bun-linux-arm64`, `bun-linux-x64-musl`, `bun-linux-arm64-musl`, `bun-darwin-x64`, `bun-darwin-arm64`.
  - [x] Do not emit `bun-windows-*` artifacts in v1.
- [x] Generate and validate checksums (AC: 3, 6, 7)
  - [x] Generate SHA-256 entries for every emitted binary and only those binaries.
  - [x] Use deterministic manifest formatting that Lua install code can parse later, for example `<sha256>  <artifact-name>` one entry per line.
  - [x] Fail if any expected artifact is missing from the manifest.
  - [x] Resolve the in-source checksum constraint explicitly: either make the tag workflow compare generated checksums against a committed root `checksums.txt`, or add a documented pre-tag `workflow_dispatch`/script path that produces the manifest to commit before tagging.
  - [x] Do not make Story 3.2 fetch an unpinned remote manifest as the source of trust.
- [x] Publish release assets atomically enough for v1 (AC: 4, 6)
  - [x] Upload all binaries and the checksum manifest to the release for the triggering tag.
  - [x] Fail before upload if any build or checksum step failed.
  - [x] Avoid `gh release upload --clobber` in normal tagged releases; clobbering can delete existing assets before a failed re-upload.
  - [x] Make partial-release behavior visible in logs if GitHub asset upload fails after the release has been created.
- [x] Add focused validation for the workflow (AC: 1-7)
  - [x] Add a local or CI-checkable workflow lint/smoke path where practical, such as YAML syntax validation plus a shell dry-run of the target list/checksum generation.
  - [x] Keep existing `ci.yml` scaffold behavior intact.
  - [x] Document manual verification commands in the story completion notes when implemented.

### Review Findings

- [x] [Review][Patch] Release helper resolved build inputs from the caller cwd [scripts/release.ts:100] — fixed by running Bun build commands from the repository root so package release scripts and workflow commands use the same inputs and produce matching checksum manifests.

## Dev Notes

### Scope Boundary

This story is release infrastructure only. Do not implement:

- installer platform detection, download, temp-file verification, atomic rename, `chmod +x`, or macOS quarantine stripping; those belong to Story 3.2
- source-build fallback UX, dedicated process-group fallback spawn, install failure copy, or `:checkhealth`; those belong to Story 3.3
- runtime preview behavior from earlier backlog stories
- Windows prebuilt support
- signing/notarization/cosign; the architecture explicitly defers signing beyond checksum verification

### Current State Of Files To Update

- `.github/workflows/release.yml` currently contains a failing placeholder that says the release matrix is intentionally unimplemented until Epic 3. Replace this file in place.
- `.github/workflows/ci.yml` already installs Bun, Neovim, Lua tooling, runs Stylua, Lua smoke, Busted smoke, `bun test server`, and frontend bundle smoke. Preserve this workflow unless release validation needs a narrow addition.
- `server/package.json` currently has `start`, `test`, and a scaffold `build` script: `bun build server.ts --target=bun --outdir ../dist/server`. The release story likely needs either workflow-local compile commands or updated package scripts for all release targets.
- `server/server.ts` is still a scaffold entrypoint. The release pipeline can compile it, but a production release must ultimately be paired with completed earlier runtime stories before users receive a useful binary.
- `server/static.ts` currently returns `dist/frontend`. If the implementation chooses true embedding inside the executable, update server/static handling consistently with the architecture and do not leave the binary dependent on loose files at runtime.
- `.gitignore` already ignores `dist/`, `node_modules/`, and `.bun/`. Do not commit built binaries from `dist/`; only commit source/config and, if required by the chosen release process, the root `checksums.txt` manifest.

### Architecture Guardrails

- Use Bun `--compile` for the server binary toolchain. The architecture selected Bun because it can cross-compile the required Linux/macOS targets from one CI runner, including musl targets. [Source: `_bmad-output/planning-artifacts/architecture.md` "Tier 2 - Server Binary Toolchain"]
- The release pipeline must build Linux x64/arm64 including musl and macOS x64/arm64. [Source: `_bmad-output/planning-artifacts/architecture.md` "Distribution, Install & CI"]
- Binaries are GitHub Release assets pinned to the tag. Do not use `latest` as an installer trust root. [Source: `_bmad-output/planning-artifacts/prds/prd-interactive-graphviz.nvim-2026-06-02/addendum.md` "Distribution / supply-chain notes"]
- The checksum manifest is part of the trusted in-source install path. Generated release checksums must not become a mutable remote trust source that Story 3.2 blindly downloads beside the artifact. [Source: `_bmad-output/planning-artifacts/architecture.md` "Distribution, Install & CI"]
- The frontend must be embedded or otherwise included in the single-file server distribution; v1 must not require users to install frontend dependencies or carry a Node/yarn runtime. [Source: `_bmad-output/planning-artifacts/architecture.md` "Critical Blind Spot Roundtable"]
- Keep the release artifact names aligned with future platform/libc detection in `lua/interactive-graphviz/install.lua`: Linux glibc vs musl is a required distinction. [Source: `_bmad-output/planning-artifacts/architecture.md` "Distribution, Install & CI"]

### Latest Technical Information

- Bun's executable documentation lists current cross-compile targets for `bun-linux-x64`, `bun-linux-arm64`, `bun-linux-x64-musl`, `bun-linux-arm64-musl`, `bun-darwin-x64`, and `bun-darwin-arm64`. It also notes x64 baseline targets for older CPUs; do not add baseline artifacts unless product scope changes, but keep the naming strategy extensible. [Source: https://bun.com/docs/bundler/executables]
- GitHub Actions supports tag-filtered `push` workflows; use the tag ref rather than creating releases from an unverified branch ref. [Source: https://docs.github.com/actions/reference/events-that-trigger-workflows]
- GitHub CLI `gh release create` accepts asset filenames, supports `--verify-tag`, and can generate notes. Use `--verify-tag` or equivalent API behavior so a release is not created for a non-existent tag. [Source: https://cli.github.com/manual/gh_release_create]
- GitHub CLI `gh release upload --clobber` deletes existing assets before re-uploading; avoid it for normal release publishing because a failed replacement can lose the original asset. [Source: https://cli.github.com/manual/gh_release_upload]

### Release Manifest Decision

There is a tension between "generate checksums on tagged release" and "checksums committed in-source". A workflow triggered by an already-created tag cannot update that tag's source tree. The implementation must make this explicit instead of silently weakening integrity:

- Preferred: provide a manual manifest-preparation mode or script that builds the same target matrix, writes root `checksums.txt`, and is run before tagging; the tag workflow regenerates checksums and fails if they differ from the committed manifest.
- Acceptable only if documented for v1: the tag workflow publishes generated `checksums.txt` as the release manifest while also creating the root `checksums.txt` format and a clear follow-up for Story 3.2 to pin installer trust to the release tag. If this route is chosen, call out the integrity trade-off in completion notes.

### Testing Requirements

- Workflow syntax must be valid YAML.
- Target list must be tested so missing `linux-arm64-musl` cannot regress unnoticed.
- Checksum generation must be tested with at least temporary fixture files or a dry-run directory.
- Release publishing should be guarded so local/manual dry-runs can exercise build and checksum logic without uploading assets.
- Existing CI checks from Story 1.1 must continue to pass after any script/package changes: Stylua check, Lua smoke, Busted smoke, `bun test server`, and frontend bundle smoke.

### Anti-Patterns To Avoid

- Do not publish from `workflow_dispatch` without an explicit tag input and verification.
- Do not upload artifacts named only by Bun target if Story 3.2 cannot map them deterministically.
- Do not include Windows artifacts "because Bun can"; product scope says no Windows prebuilt in v1.
- Do not replace checksum verification with GitHub asset existence.
- Do not make the release binary depend on files in `dist/frontend` being present on the user's machine unless the installer will also fetch and verify them; the architecture's target is a single-file server distribution.
- Do not make `checksums.txt` a generated file that exists only in CI logs.

## Project Structure Notes

Expected touched files for implementation:

- `.github/workflows/release.yml` (UPDATE): replace placeholder with real release pipeline.
- `server/package.json` (UPDATE, likely): add release build scripts if the workflow should call named scripts rather than inline commands.
- `server/static.ts` and related server/frontend build files (UPDATE, possible): only if needed to satisfy frontend embedding/single-file distribution.
- `checksums.txt` (NEW or UPDATE): root trusted manifest format, depending on the chosen in-source checksum process.
- `.gitignore` (UPDATE, unlikely): only if a non-binary manifest or generated release metadata must be tracked while keeping `dist/` ignored.

## References

- Epics: `_bmad-output/planning-artifacts/epics.md` "Story 3.1: Cross-compiled release pipeline with checksums"
- PRD: `_bmad-output/planning-artifacts/prds/prd-interactive-graphviz.nvim-2026-06-02/prd.md` "FR-12: Prebuilt binary install"
- PRD addendum: `_bmad-output/planning-artifacts/prds/prd-interactive-graphviz.nvim-2026-06-02/addendum.md` "Distribution / supply-chain notes"
- Architecture: `_bmad-output/planning-artifacts/architecture.md` "Tier 2 - Server Binary Toolchain"; "Distribution, Install & CI"; "Project Structure & Boundaries"
- Existing scaffold story: `_bmad-output/implementation-artifacts/1-1-project-scaffold-and-development-harness.md`
- Bun executable targets: https://bun.com/docs/bundler/executables
- GitHub Actions tag events: https://docs.github.com/actions/reference/events-that-trigger-workflows
- GitHub CLI release create: https://cli.github.com/manual/gh_release_create
- GitHub CLI release upload: https://cli.github.com/manual/gh_release_upload

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- 2026-06-03T16:19:27+0200: Existing partial `server/release.test.ts` described release target/checksum behavior but failed red because `scripts/release` did not exist.
- 2026-06-03T16:19:27+0200: Initial cross-compile attempt failed under restricted network while Bun downloaded target runtimes; reran with approved network access and completed target runtime downloads.
- 2026-06-03T16:19:27+0200: Temporary smoke binary in `dist/release` caused release validation to fail closed as unexpected; reran final manifest generation in a clean ignored output directory.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Replaced the release placeholder with a single-runner tag release workflow that builds the six v1 Linux/macOS artifacts, verifies committed checksums on tag publish, and publishes via `gh release create "$RELEASE_TAG" --verify-tag`.
- Added `workflow_dispatch` manifest-preparation mode that builds the same artifacts and uploads a prepared root `checksums.txt` for pre-tag commit preparation without publishing release assets.
- Added `scripts/release.ts` as the shared release target/checksum/build helper and committed root `checksums.txt` generated from the corrected Bun executable build.
- Wired `server/server.ts` to reference the frontend HTML bundle through `server/static.ts`, so `bun build --compile` pulls the frontend entry into the executable and does not rely on runtime Node/yarn/Bun.
- Added focused release tests for target metadata, checksum manifest validation, workflow guardrails, and server frontend entrypoint exposure.
- Manual verification commands run: `bun run scripts/release.ts build --out-dir dist/release-final --write-checksums dist/release-final/checksums.txt --verify-against checksums.txt`, `bun test server`, `stylua --check .`, `nvim --headless -i NONE -u tests/minimal_init.lua -l tests/nvim_smoke.lua -c qa`, `bun build frontend/index.html --outdir dist/frontend`, `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/ci.yml"); YAML.load_file(".github/workflows/release.yml")'`, `bun run scripts/release.ts validate-targets`, and `bun run scripts/release.ts validate-manifest --manifest checksums.txt`.
- Local `busted tests/scaffold_spec.lua` could not run because `busted` is not installed in this machine's PATH; CI still installs and runs it.

### File List

- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `_bmad-output/implementation-artifacts/3-1-cross-compiled-release-pipeline-with-checksums.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `checksums.txt`
- `scripts/release.ts`
- `server/package.json`
- `server/release.test.ts`
- `server/server.test.ts`
- `server/server.ts`
- `server/static.ts`

### Change Log

- 2026-06-03: Implemented cross-compiled Bun release pipeline with committed checksum verification and focused release validation.
