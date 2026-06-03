local M = {}

local augroup = nil

-- Register the graceful-exit hook. Idempotent; called once a server exists.
function M.setup()
  if augroup then
    return
  end
  augroup = vim.api.nvim_create_augroup("InteractiveGraphvizLifecycle", { clear = true })
  vim.api.nvim_create_autocmd("VimLeavePre", {
    group = augroup,
    callback = function()
      M.teardown()
    end,
  })
end

-- Graceful teardown ONLY. The no-orphan guarantee must not depend on this running:
-- on abnormal exit (`kill -9`) VimLeavePre does not fire, and the server still
-- self-terminates via stdin EOF / heartbeat. This is the convenience path.
function M.teardown()
  require("interactive-graphviz.server").shutdown()
  require("interactive-graphviz.session").reset()
end

return M
