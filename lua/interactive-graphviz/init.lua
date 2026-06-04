local M = {}

-- Lifecycle ordering: setup() only stores validated options via config.setup().
-- server.lua reads config.get() lazily at spawn time (M.ensure_started()), so
-- calling setup() multiple times is safe — new config is picked up on the next
-- server spawn. A running server's bind address cannot change until the next
-- spawn (AC4: no kill/restart on re-setup). See Story 2.1 for full rationale.
function M.setup(opts)
  require("interactive-graphviz.config").setup(opts or {})
  return M
end

return M
