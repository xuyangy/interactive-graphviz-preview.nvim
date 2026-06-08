-- Child Neovim driver for the no-orphan integration test.
--
-- Spawns the server, waits for `ready`, records the server PID to IG_PID_FILE,
-- then blocks "forever" so the PARENT must kill -9 this Neovim — simulating an
-- abnormal exit where VimLeavePre never fires. The server must then self-terminate
-- via stdin EOF (and/or the heartbeat backstop), leaving no orphan.
--
-- Writes a sibling `<IG_PID_FILE>.diag` trace so a startup failure (download,
-- checksum, spawn, ready) is visible to the harness rather than swallowed by
-- log_level="off". The POSIX/Windows runners print it on failure.

local pid_file = vim.env.IG_PID_FILE
if not pid_file or pid_file == "" then
  error("IG_PID_FILE not set")
end

local diag_file = pid_file .. ".diag"
local function diag(msg)
  pcall(vim.fn.writefile, { tostring(msg) }, diag_file, "a")
end

require("interactive-graphviz").setup({ heartbeat_ms = 250, log_level = "off" })
local server = require("interactive-graphviz.server")

-- Resolve the server command explicitly first so install/download/checksum
-- failures surface in the diag trace (open_session routes them through
-- log.error, which log_level="off" suppresses). The first resolve downloads the
-- prebuilt and can block for a while on a cold runner — leave an early breadcrumb
-- so the harness sees the child started even if it is still downloading.
diag("start: resolving server cmd (first run downloads the prebuilt)")
local install = require("interactive-graphviz.install")
local rok, rcmd = pcall(install.resolve_server_cmd)
if rok then
  diag("resolve_server_cmd ok: " .. tostring(rcmd and rcmd[1]))
else
  diag("resolve_server_cmd FAILED: " .. tostring(rcmd))
end

local sok, serr = pcall(server.open_session, 0)
diag("open_session: ok=" .. tostring(sok) .. " ret=" .. tostring(serr))

local ready = vim.wait(15000, function()
  return server.state.running and server.state.handle ~= nil
end, 25)

if not ready or not server.state.handle then
  diag(
    "NOT READY: alive="
      .. tostring(server.state.alive)
      .. " running="
      .. tostring(server.state.running)
      .. " handle="
      .. tostring(server.state.handle ~= nil)
  )
  vim.fn.writefile({ "ERROR_NOT_READY" }, pid_file)
  vim.cmd("qa!")
  return
end

diag("READY: server pid=" .. tostring(server.state.handle.pid))
vim.fn.writefile({ tostring(server.state.handle.pid) }, pid_file)

-- Block until killed by the parent (or a generous safety timeout).
vim.wait(60000, function()
  return false
end, 200)
