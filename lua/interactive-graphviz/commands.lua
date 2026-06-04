local M = {}

local function placeholder(command)
  require("interactive-graphviz.log").notify(
    command .. " is not implemented in the scaffold story",
    vim.log.levels.INFO
  )
end

-- Returns true if the given buffer contains DOT/Graphviz content.
local function is_dot_buffer(bufnr)
  if vim.bo[bufnr].filetype == "dot" then
    return true
  end
  -- Defensive fallback: filetype may be empty for a new unsaved buffer.
  local name = vim.api.nvim_buf_get_name(bufnr)
  return name:match("%.dot$") ~= nil or name:match("%.gv$") ~= nil
end

function M.preview()
  local server = require("interactive-graphviz.server")
  local session = require("interactive-graphviz.session")
  local config = require("interactive-graphviz.config")
  local log = require("interactive-graphviz.log")

  local bufnr = vim.api.nvim_get_current_buf()

  if not is_dot_buffer(bufnr) then
    log.notify("GraphvizPreview: current buffer is not a DOT/GV file", vim.log.levels.INFO)
    return
  end

  if not server.open_session(bufnr) then
    log.notify("GraphvizPreview: failed to start server", vim.log.levels.ERROR)
    return
  end

  -- Register live-reload autocmd for this buffer (Story 1.5).
  -- pcall guard: a failure here should not block the initial render or browser open.
  local ok_watch, watch_err = pcall(require("interactive-graphviz.render").start_watch, bufnr)
  if not ok_watch then
    log.warn("GraphvizPreview: failed to register live-reload autocmd: " .. tostring(watch_err))
  end

  -- Send the initial render — server.send queues until `ready`, so this is safe
  -- to call before the server has announced its port/token.
  local dot = table.concat(vim.api.nvim_buf_get_lines(bufnr, 0, -1, false), "\n")
  server.send({
    type = "render",
    sessionId = bufnr,
    v = session.next_version(bufnr),
    engine = config.get().engine,
    dot = dot,
  })

  -- Open the browser only once port/token are known (async ready ordering).
  -- server.on_ready fires immediately if the server is already running, or
  -- defers until `ready` arrives — keeping the callback self-contained here.
  server.on_ready(function()
    if not vim.api.nvim_buf_is_valid(bufnr) then
      return
    end
    local port = server.state.port
    local token = server.state.token
    if not port or not token then
      log.notify("GraphvizPreview: server ready but port/token missing", vim.log.levels.ERROR)
      return
    end
    local url = string.format("http://127.0.0.1:%d/?sessionId=%d&token=%s", port, bufnr, token)
    local open_cmd = config.get().open_cmd
    if open_cmd then
      local parts = vim.split(open_cmd, "%s+", { trimempty = true })
      table.insert(parts, url)
      vim.system(parts)
    else
      vim.ui.open(url)
    end
  end)
end

function M.stop()
  placeholder("GraphvizPreviewStop")
end

function M.toggle()
  placeholder("GraphvizPreviewToggle")
end

function M.engine()
  placeholder("GraphvizEngine")
end

return M
