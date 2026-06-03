local M = {}

local function placeholder(command)
  require("interactive-graphviz.log").notify(
    command .. " is not implemented in the scaffold story",
    vim.log.levels.INFO
  )
end

function M.preview()
  placeholder("GraphvizPreview")
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
