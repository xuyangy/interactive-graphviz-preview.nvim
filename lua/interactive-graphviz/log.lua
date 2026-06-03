local M = {}

function M.notify(message, level)
  vim.notify(message, level or vim.log.levels.INFO, { title = "interactive-graphviz.nvim" })
end

return M
