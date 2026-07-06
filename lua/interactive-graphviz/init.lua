local M = {}

-- Lifecycle ordering: setup() only stores validated options via config.setup().
-- server.lua reads config.get() lazily at spawn time (M.ensure_started()), so
-- calling setup() multiple times is safe — new config is picked up on the next
-- server spawn. A running server's bind address cannot change until the next
-- spawn (AC4: no kill/restart on re-setup). See Story 2.1 for full rationale.
--
-- The INTERACTIVITY keys (preserve_view, highlight_mode, animate, search.*,
-- sync.jump_on_click) additionally reach already-open previews live: a re-run
-- setup() pushes them as a config_update message. push_config never spawns a
-- server, so first-run setup stays store-only as before.
function M.setup(opts)
  require("interactive-graphviz.config").setup(opts or {})
  require("interactive-graphviz.server").push_config()
  return M
end

return M
