local M = {}

-- Resolve the command used to spawn the server.
--
-- v1 dev: run the server from source via Bun. Epic 3 (Story 3.2) replaces the body
-- with prebuilt-binary resolution while keeping this function's name and contract
-- stable, so the spawn path in server.lua never has to change.
function M.resolve_server_cmd()
  local matches = vim.api.nvim_get_runtime_file("server/server.ts", false)
  local server_entry = matches[1]
  if not server_entry then
    error("interactive-graphviz: could not locate server/server.ts on runtimepath")
  end
  return { "bun", "run", server_entry }
end

return M
