local M = {}

M.defaults = {
  engine = "dot",
  engines = { "dot", "neato" },
  debounce_ms = 200,
  bind = "127.0.0.1",
  port = 0,
  expose_to_lan = false,
  open_cmd = nil,
  preserve_view = true,
  heartbeat_ms = 2000,
  log_level = "warn",
}

M.options = vim.deepcopy(M.defaults)

function M.setup(opts)
  M.options = vim.tbl_deep_extend("force", vim.deepcopy(M.defaults), opts or {})
  return M.options
end

function M.get()
  return M.options
end

return M
