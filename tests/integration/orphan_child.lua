-- Child Neovim driver for the no-orphan integration test.
--
-- Spawns the server, waits for `ready`, records the server PID to IG_PID_FILE,
-- then blocks "forever" so the PARENT must kill -9 this Neovim — simulating an
-- abnormal exit where VimLeavePre never fires. The server must then self-terminate
-- via stdin EOF (and/or the heartbeat backstop), leaving no orphan.

local pid_file = vim.env.IG_PID_FILE
if not pid_file or pid_file == "" then
  error("IG_PID_FILE not set")
end

require("interactive-graphviz").setup({ heartbeat_ms = 250, log_level = "off" })
local server = require("interactive-graphviz.server")

server.open_session(0)

local ready = vim.wait(15000, function()
  return server.state.running and server.state.handle ~= nil
end, 25)

if not ready or not server.state.handle then
  vim.fn.writefile({ "ERROR_NOT_READY" }, pid_file)
  vim.cmd("qa!")
  return
end

vim.fn.writefile({ tostring(server.state.handle.pid) }, pid_file)

-- Block until killed by the parent (or a generous safety timeout).
vim.wait(60000, function()
  return false
end, 200)
