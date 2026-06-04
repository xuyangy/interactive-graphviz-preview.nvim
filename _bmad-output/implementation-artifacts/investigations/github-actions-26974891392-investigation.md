# Investigation: GitHub Actions run 26974891392

## Hand-off Brief

1. **What happened.** CI run `26974891392` failed on 2026-06-04 in the `Busted smoke` step at commit `2bd3712`, with six `commands.lua:42: attempt to call field 'warn' (a nil value)` errors.
2. **Where the case stands.** That original Busted failure is fixed on current `main`; the latest run checked, `26979585311` at commit `345b473`, passes Busted but fails in `Bun tests`.
3. **What's needed next.** Keep the workflow dependency install change and rerun CI; the current failure is consistent with fresh runners missing `frontend/` and `server/` Bun dependencies.

## Case Info

| Field | Value |
| --- | --- |
| Ticket | GitHub Actions run `26974891392` |
| Date opened | 2026-06-04 |
| Status | Concluded |
| System | GitHub Actions `ubuntu-latest`, CI workflow |
| Evidence sources | GitHub run logs, workflow files, package manifests, local validation |

## Problem Statement

User provided failed job URL: `https://github.com/xuyangy/interactive-graphviz.nvim/actions/runs/26974891392`.

## Evidence Inventory

| Source | Status | Notes |
| --- | --- | --- |
| GitHub run `26974891392` | Available | `scaffold` job failed at `Busted smoke`; failed commit `2bd3712`. |
| GitHub run `26979585311` | Available | Current `main` at `345b473` failed at `Bun tests`; Busted passed. |
| `.github/workflows/ci.yml` | Available | Setup installed Bun but did not run `bun install` before Bun tests/build smoke. |
| `.github/workflows/release.yml` | Available | Release build also used Bun without installing workspace dependencies. |
| `frontend/package.json`, `server/package.json` | Available | Required packages are declared in workspace-local manifests with lockfiles. |

## Confirmed Findings

### Finding 1: Linked run failed in Busted smoke

**Evidence:** GitHub run `26974891392`, job `79599262686`.

**Detail:** Six errors were reported from `tests/commands_spec.lua`, all caused by `./lua/interactive-graphviz/commands.lua:42: attempt to call field 'warn' (a nil value)`.

### Finding 2: Current main has moved past the original Busted failure

**Evidence:** GitHub run `26979585311`, job `79615148395`; current `main` commit `345b473`.

**Detail:** `Busted smoke` passed; `Bun tests` failed.

### Finding 3: Current CI runner lacks Bun dependency installation

**Evidence:** `.github/workflows/ci.yml:12` used `oven-sh/setup-bun@v2`, followed later by `bun test server`, with no `bun install` step before the patch.

**Detail:** Current job log reports `Cannot find module '@hpcc-js/wasm-graphviz' from server/render.test.ts`; the same run returns HTTP 500 for `/`, consistent with unresolved frontend module graph dependencies.

## Source Code Trace

| Element | Detail |
| --- | --- |
| Error origin | CI workflow dependency setup, not application logic |
| Trigger | Fresh GitHub runner executes `bun test server` without installed `server/` and `frontend/` dependencies |
| Condition | Dependency manifests and lockfiles exist under sibling workspaces, but CI did not install them |
| Related files | `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `server/package.json`, `frontend/package.json` |

## Conclusion

**Confidence:** High

The linked run's immediate `log.warn` Busted failure was already resolved by later commits. The actionable failure on current `main` is the missing dependency install in CI and Release workflows. The patch adds locked installs for both Bun workspaces before tests and builds.

## Recommended Next Steps

### Fix direction

Keep the workflow install step:

- `bun install --cwd frontend --frozen-lockfile`
- `bun install --cwd server --frozen-lockfile`

### Diagnostic

Push the workflow change and rerun CI on `main`.

## Reproduction Plan

Run the workflow on a clean GitHub runner. Before the patch, `bun test server` cannot resolve `@hpcc-js/wasm-graphviz`. After the patch, the dependency-sensitive steps should have the required workspace `node_modules`.
