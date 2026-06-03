local M = {}

-- Lua-side session cache: an idempotency / UI mirror only. The server owns the
-- authoritative sessions map; this is NEVER authoritative for cleanup.
-- Architecture invariant: session-map mutation on the Lua side lives ONLY here.
M.active = {}

-- Monotonic per-buffer render version counters. The `v` token is consumed
-- end-to-end in Story 1.5; it is defined here because session.lua owns per-session
-- state, and it must survive register/unregister churn (never resets on its own).
local versions = {}

function M.register(bufnr)
  if M.active[bufnr] == nil then
    M.active[bufnr] = { bufnr = bufnr }
  end
  return M.active[bufnr]
end

function M.unregister(bufnr)
  M.active[bufnr] = nil
end

function M.has(bufnr)
  return M.active[bufnr] ~= nil
end

function M.count()
  local n = 0
  for _ in pairs(M.active) do
    n = n + 1
  end
  return n
end

-- Mint the next monotonic version for a buffer. Minted ONLY at the Neovim source.
function M.next_version(bufnr)
  versions[bufnr] = (versions[bufnr] or 0) + 1
  return versions[bufnr]
end

-- Full reset of the Lua-side cache (used on graceful teardown).
function M.reset()
  M.active = {}
  versions = {}
end

return M
