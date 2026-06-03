local M = {}

-- Single funnel for user-facing output. Level vocabulary matches the wire/server
-- (off|error|warn|info|debug) and is gated by the configured `log_level` so server
-- diagnostics (e.g. stderr lines) don't spam the user at the default level.
local LEVELS = { off = 0, error = 1, warn = 2, info = 3, debug = 4 }

local function threshold()
  local ok, config = pcall(require, "interactive-graphviz.config")
  if ok then
    return LEVELS[config.get().log_level] or LEVELS.warn
  end
  return LEVELS.warn
end

function M.notify(message, level)
  vim.notify(message, level or vim.log.levels.INFO, { title = "interactive-graphviz.nvim" })
end

local function gated(message, configured_level, vim_level)
  if threshold() >= configured_level then
    M.notify(message, vim_level)
  end
end

function M.error(message)
  gated(message, LEVELS.error, vim.log.levels.ERROR)
end

function M.warn(message)
  gated(message, LEVELS.warn, vim.log.levels.WARN)
end

function M.info(message)
  gated(message, LEVELS.info, vim.log.levels.INFO)
end

function M.debug(message)
  gated(message, LEVELS.debug, vim.log.levels.DEBUG)
end

return M
