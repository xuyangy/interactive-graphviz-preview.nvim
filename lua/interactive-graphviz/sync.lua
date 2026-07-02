-- sync.lua — Story 6.2: graph → buffer navigation. Maps a clicked node id to
-- its first occurrence in the DOT buffer and moves the cursor there.
--
-- There is deliberately NO maintained source map: the buffer text is scanned on
-- demand at click time, so a stale browser (live-reload race) degrades to an
-- informative notify instead of a wrong jump. The matcher is pure
-- (lines + node_id in, line/col out) so busted can cover it without a real
-- Neovim; only handle_node_click touches vim APIs.
local M = {}

-- Is `c` (one byte) a DOT identifier byte? The DOT grammar allows
-- [A-Za-z_0-9] plus any byte in \200-\377 octal (128–255 decimal) in bare IDs,
-- so every UTF-8 continuation/lead byte counts as an ID byte. Using bare [%w_]
-- here would treat `ñ` as a boundary and let `a` false-match the prefix of
-- `añejo` (review finding, Story 6.2).
local function is_id_byte(c)
  if c == "" then
    return false
  end
  return c:match("[%w_]") ~= nil or c:byte() >= 128
end

-- Can `id` appear as a BARE (unquoted) token in DOT source? Bare IDs are
-- identifier-shaped ([A-Za-z_\128-\255][A-Za-z_0-9\128-\255]*) or numerals
-- (-?(.d+ | d+(.d*)?)). Anything else (spaces, punctuation, quotes) only ever
-- occurs quoted — bare-scanning such ids can only produce false matches (e.g.
-- a node id of " " matching arbitrary indentation).
local function bare_eligible(id)
  if id:match("^[%a_\128-\255][%w_\128-\255]*$") then
    return true
  end
  return id:match("^%-?%d+%.?%d*$") ~= nil or id:match("^%-?%.%d+$") ~= nil
end

-- Scan one line for `node_id`, DOT-syntax-aware. Matchable occurrences:
--   * a quoted ID: `"node one" -> b` — the UNESCAPED quoted body must equal
--     node_id exactly (a colon inside the quotes is part of the ID, never a
--     port separator);
--   * a bare token (only when `bare_ok`): `a -> b` — with DOT-ID boundaries so
--     `a` never matches `alpha`/`añejo`; a following `:` is fine (`node:port`).
-- NON-matchable regions are consumed wholesale so they can never false-match:
-- quoted strings other than the id (`x [label="a b"]`), `//` and line-leading
-- `#` comments, `/* */` block comments, and HTML strings `<...>` (both may span
-- lines — `state` carries block_comment/html_depth across calls).
-- Returns the 1-based byte column of the match, or nil.
local function find_on_line(line, node_id, state, bare_ok)
  local i = 1
  local n = #line
  local id_len = #node_id
  -- A line whose first non-blank char is `#` is preprocessor output per the
  -- DOT grammar — comment, unless we're inside a multi-line construct.
  if not state.block_comment and state.html_depth == 0 and line:match("^%s*#") then
    return nil
  end
  while i <= n do
    local c = line:sub(i, i)
    if state.block_comment then
      if c == "*" and line:sub(i + 1, i + 1) == "/" then
        state.block_comment = false
        i = i + 2
      else
        i = i + 1
      end
    elseif state.html_depth > 0 then
      -- HTML strings nest with balanced angle brackets.
      if c == "<" then
        state.html_depth = state.html_depth + 1
      elseif c == ">" then
        state.html_depth = state.html_depth - 1
      end
      i = i + 1
    elseif c == '"' then
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
    elseif c == "/" and line:sub(i + 1, i + 1) == "/" then
      return nil -- `//` comment: rest of the line is dead
    elseif c == "/" and line:sub(i + 1, i + 1) == "*" then
      state.block_comment = true
      i = i + 2
    elseif c == "<" then
      state.html_depth = 1
      i = i + 1
    else
      if bare_ok and line:sub(i, i + id_len - 1) == node_id then
        local prev = i > 1 and line:sub(i - 1, i - 1) or ""
        local nxt = line:sub(i + id_len, i + id_len)
        if not is_id_byte(prev) and not is_id_byte(nxt) then
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
  local bare_ok = bare_eligible(node_id)
  local state = { block_comment = false, html_depth = 0 }
  for lnum, line in ipairs(lines) do
    if type(line) == "string" then
      local col = find_on_line(line, node_id, state, bare_ok)
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
  -- Prefer a window on the CURRENT tabpage: win_findbuf can return windows on
  -- other tabs, where a silent cursor move looks like nothing happened (review
  -- finding). Cross-tab fallback still moves the cursor (correct when the user
  -- switches back) but says so.
  local target = nil
  local ok_tab, current_tab = pcall(vim.api.nvim_get_current_tabpage)
  if ok_tab then
    for _, win in ipairs(wins) do
      local ok_win, tab = pcall(vim.api.nvim_win_get_tabpage, win)
      if ok_win and tab == current_tab then
        target = win
        break
      end
    end
  end
  local other_tab = target == nil
  target = target or wins[1]
  -- nvim_win_set_cursor wants a 0-based column. pcall: the window could vanish
  -- between win_findbuf and here (async dispatch), and a race must not error.
  local ok = pcall(vim.api.nvim_win_set_cursor, target, { lnum, col - 1 })
  if not ok then
    log.notify("GraphvizSync: could not move the cursor — not jumping", vim.log.levels.INFO)
    return false
  end
  if other_tab then
    log.notify(
      "GraphvizSync: jumped to '" .. node_id .. "' in a window on another tab",
      vim.log.levels.INFO
    )
  end
  return true
end

return M
