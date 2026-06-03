local M = {}

function M.setup(opts)
  require("interactive-graphviz.config").setup(opts or {})
  return M
end

return M
