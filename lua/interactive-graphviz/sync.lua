-- sync.lua — Story 6.2: graph → buffer navigation. Maps a clicked node id to
-- its first occurrence in the DOT buffer and moves the cursor there.
--
-- There is deliberately NO maintained source map: the buffer text is scanned on
-- demand at click time, so a stale browser (live-reload race) degrades to an
-- informative notify instead of a wrong jump. The matcher is pure
-- (lines + node_id in, line/col out) so busted can cover it without a real
-- Neovim; only handle_node_click touches vim APIs.
local M = {}

-- Scan one line for `node_id`, quote-aware. Two ways a node id occurs in DOT:
--   * as a quoted ID: `"node one" -> b` — the UNESCAPED quoted body must equal
--     node_id exactly (a colon inside the quotes is part of the ID, never a
--     port separator);
--   * as a bare token: `a -> b` — matched with DOT-ID boundaries (neighbors
--     must not be [%w_], so `a` never matches `alpha`; a following `:` is fine,
--     that is the `node:port` form).
-- Quoted regions are consumed wholesale, so a bare search never false-matches
-- text inside a label/string (`x [label="a b"]` does not match node `a`).
-- Returns the 1-based byte column of the match, or nil.
local function find_on_line(line, node_id)
  local i = 1
  local n = #line
  local id_len = #node_id
  while i <= n do
    local c = line:sub(i, i)
    if c == '"' then
      local start = i
      local buf = {}
      i = i + 1
      while i <= n do
        local qc = line:sub(i, i)
        if qc == "\\" then
          local nxt = line:sub(i + 1, i + 1)
          if nxt == '"' or nxt == "\\" then
            -- \" and \\ unescape; any other backslash sequence stays literal
            -- (DOT keeps unknown escapes as-is in IDs).
            table.insert(buf, nxt)
            i = i + 2
          else
            table.insert(buf, qc)
            i = i + 1
          end
        elseif qc == '"' then
          i = i + 1
          break
        else
          table.insert(buf, qc)
          i = i + 1
        end
      end
      if table.concat(buf) == node_id then
        return start
      end
    else
      if line:sub(i, i + id_len - 1) == node_id then
        local prev = i > 1 and line:sub(i - 1, i - 1) or ""
        local nxt = line:sub(i + id_len, i + id_len)
        if not prev:match("[%w_]") and not nxt:match("[%w_]") then
          return i
        end
      end
      i = i + 1
    end
  end
  return nil
end

-- Find the FIRST line containing `node_id` (definition or occurrence — DOT
-- nodes are implicitly defined by first mention, so first occurrence IS the
-- definition site). Returns (lnum, col), both 1-based, or nil when absent —
-- the stale-browser path.
function M.find_node_line(lines, node_id)
  if type(lines) ~= "table" or type(node_id) ~= "string" or node_id == "" then
    return nil
  end
  for lnum, line in ipairs(lines) do
    if type(line) == "string" then
      local col = find_on_line(line, node_id)
      if col then
        return lnum, col
      end
    end
  end
  return nil
end

-- Handle a relayed node_click: put the cursor on the node's first source line.
-- `session_id` is the buffer number (the sessionId convention since Story 1.3).
-- Every degraded path notifies and returns false without touching the cursor;
-- nothing here ever throws (the caller additionally pcall-wraps). Only a window
-- ALREADY displaying the buffer is used — never raises/focuses anything
-- (ux-sync-v3: OS focus stays wherever the window manager leaves it).
function M.handle_node_click(session_id, node_id)
  local log = require("interactive-graphviz.log")
  if type(session_id) ~= "number" or type(node_id) ~= "string" or node_id == "" then
    return false
  end
  local bufnr = session_id
  if not vim.api.nvim_buf_is_valid(bufnr) then
    log.notify(
      "GraphvizSync: buffer " .. bufnr .. " no longer exists — not jumping",
      vim.log.levels.INFO
    )
    return false
  end
  local lines = vim.api.nvim_buf_get_lines(bufnr, 0, -1, false)
  local lnum, col = M.find_node_line(lines, node_id)
  if not lnum then
    log.notify(
      "GraphvizSync: node '" .. node_id .. "' not found in the buffer — not jumping",
      vim.log.levels.INFO
    )
    return false
  end
  local wins = vim.fn.win_findbuf(bufnr)
  if type(wins) ~= "table" or #wins == 0 then
    log.notify(
      "GraphvizSync: buffer " .. bufnr .. " is not displayed in any window — not jumping",
      vim.log.levels.INFO
    )
    return false
  end
  -- nvim_win_set_cursor wants a 0-based column. pcall: the window could vanish
  -- between win_findbuf and here (async dispatch), and a race must not error.
  local ok = pcall(vim.api.nvim_win_set_cursor, wins[1], { lnum, col - 1 })
  if not ok then
    log.notify("GraphvizSync: could not move the cursor — not jumping", vim.log.levels.INFO)
    return false
  end
  return true
end

return M
