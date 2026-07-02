-- Unit tests for sync.lua (Story 6.2): the node→line matcher and the
-- handle_node_click cursor-jump behavior. Designed to run under plain busted
-- (no Neovim): vim APIs and the log module are stubbed via _G.vim +
-- package.loaded injection, exactly like config_spec.lua.
package.path = "./lua/?.lua;./lua/?/init.lua;" .. package.path

-- ── stubs ─────────────────────────────────────────────────────────────────────

local notify_calls = {}
local cursor_calls = {}

-- Mutable per-test state driving the vim stub.
local state = {
  valid_bufs = {}, -- bufnr → true
  buf_lines = {}, -- bufnr → lines
  windows = {}, -- bufnr → { winid, ... }
  win_tabs = {}, -- winid → tabpage handle (default 1)
  current_tab = 1,
  set_cursor_error = false, -- force nvim_win_set_cursor to throw
}

_G.vim = {
  log = { levels = { WARN = 3, ERROR = 4, INFO = 2, DEBUG = 0 } },
  api = {
    nvim_buf_is_valid = function(bufnr)
      return state.valid_bufs[bufnr] == true
    end,
    nvim_buf_get_lines = function(bufnr, _, _, _)
      return state.buf_lines[bufnr] or {}
    end,
    nvim_get_current_tabpage = function()
      return state.current_tab
    end,
    nvim_win_get_tabpage = function(winid)
      return state.win_tabs[winid] or 1
    end,
    nvim_win_set_cursor = function(winid, pos)
      if state.set_cursor_error then
        error("E5555: window was closed")
      end
      table.insert(cursor_calls, { winid = winid, pos = pos })
    end,
  },
  fn = {
    win_findbuf = function(bufnr)
      return state.windows[bufnr] or {}
    end,
  },
}

local log_stub = {
  notify = function(msg, level)
    table.insert(notify_calls, { msg = msg, level = level })
  end,
  warn = function(_) end,
  error = function(_) end,
  info = function(_) end,
  debug = function(_) end,
}
package.loaded["interactive-graphviz.log"] = log_stub

package.loaded["interactive-graphviz.sync"] = nil
local sync = require("interactive-graphviz.sync")

local function reset()
  notify_calls = {}
  cursor_calls = {}
  state.valid_bufs = {}
  state.buf_lines = {}
  state.windows = {}
  state.win_tabs = {}
  state.current_tab = 1
  state.set_cursor_error = false
  log_stub.notify = function(msg, level)
    table.insert(notify_calls, { msg = msg, level = level })
  end
  package.loaded["interactive-graphviz.log"] = log_stub
end

-- ── find_node_line: the pure matcher (AC4) ────────────────────────────────────

describe("sync.find_node_line — bare-ID boundaries", function()
  it("finds a bare node id on its first line", function()
    local lnum, col = sync.find_node_line({ "digraph {", "  a -> b;", "}" }, "a")
    assert.are.equal(2, lnum)
    assert.are.equal(3, col)
  end)

  it("`a` does not match `alpha` (leading position)", function()
    local lnum = sync.find_node_line({ "digraph {", "  alpha -> beta;", "  a -> b;", "}" }, "a")
    assert.are.equal(3, lnum)
  end)

  it("`a` does not match `gamma_a` or `a1` (trailing/underscore boundaries)", function()
    local lnum = sync.find_node_line({ "gamma_a -> a1;", "x -> a;" }, "a")
    assert.are.equal(2, lnum)
  end)

  it("id as an edge ENDPOINT matches (occurrence, not only definition)", function()
    local lnum, col = sync.find_node_line({ "digraph {", "  x -> target;", "}" }, "target")
    assert.are.equal(2, lnum)
    assert.are.equal(8, col)
  end)

  it("a node used with a port suffix matches the node id (node:port)", function()
    local lnum, col = sync.find_node_line({ "digraph {", "  rec:out -> b;", "}" }, "rec")
    assert.are.equal(2, lnum)
    assert.are.equal(3, col)
  end)

  it("multiple occurrences: the FIRST line wins", function()
    local lnum = sync.find_node_line({ "a -> b;", "b -> c;", "a -> c;" }, "a")
    assert.are.equal(1, lnum)
  end)

  it("id at start and end of line matches (no neighbor chars at all)", function()
    assert.are.equal(1, (sync.find_node_line({ "a" }, "a")))
    assert.are.equal(1, (sync.find_node_line({ "b -> a" }, "a")))
  end)
end)

describe("sync.find_node_line — quoted IDs", function()
  it("finds a quoted id with spaces", function()
    local lnum, col = sync.find_node_line({ "digraph {", '  "node one" -> b;', "}" }, "node one")
    assert.are.equal(2, lnum)
    assert.are.equal(3, col) -- column of the opening quote
  end)

  it('unescapes \\" inside a quoted id', function()
    local lnum = sync.find_node_line({ 'digraph { "say \\"hi\\"" -> x; }' }, 'say "hi"')
    assert.are.equal(1, lnum)
  end)

  it("unescapes \\\\ inside a quoted id", function()
    local lnum = sync.find_node_line({ '"back\\\\slash" -> x;' }, "back\\slash")
    assert.are.equal(1, lnum)
  end)

  it("a colon inside a quoted id is part of the ID, not a port", function()
    -- node "a:b" exists; clicking node `a` must NOT land on the quoted line.
    local lnum = sync.find_node_line({ '"a:b" -> c;', "a -> c;" }, "a")
    assert.are.equal(2, lnum)
    -- while clicking node `a:b` matches the quoted line exactly.
    local qlnum = sync.find_node_line({ '"a:b" -> c;', "a -> c;" }, "a:b")
    assert.are.equal(1, qlnum)
  end)

  it("a bare search never matches text inside a quoted string (labels)", function()
    local lnum = sync.find_node_line({ 'x [label="a fine label"];', "a -> x;" }, "a")
    assert.are.equal(2, lnum)
  end)

  it("a node clicked by its plain name also matches its quoted occurrence", function()
    -- DOT treats `a` and `"a"` as the same node; the SVG <title> is `a`.
    local lnum = sync.find_node_line({ 'digraph { "a" -> b; }' }, "a")
    assert.are.equal(1, lnum)
  end)
end)

describe("sync.find_node_line — DOT syntax awareness (review fixes)", function()
  it("a `//` comment never matches — the real definition wins", function()
    assert.are.equal(2, (sync.find_node_line({ "// define node a here", "a -> b;" }, "a")))
    assert.are.equal(2, (sync.find_node_line({ "b -> c; // mentions a", "a -> b;" }, "a")))
  end)

  it("a line-leading `#` (preprocessor) line never matches", function()
    assert.are.equal(2, (sync.find_node_line({ "  # a is important", "a -> b;" }, "a")))
  end)

  it("a mid-line `#` is NOT a comment per the DOT grammar", function()
    -- Only lines BEGINNING with # are preprocessor output; pin that boundary.
    assert.are.equal(1, (sync.find_node_line({ "b -> c; # a", "a -> x;" }, "a")))
  end)

  it("`/* */` block comments never match — same line and spanning lines", function()
    assert.are.equal(2, (sync.find_node_line({ "/* a */ b -> c;", "a -> b;" }, "a")))
    assert.are.equal(
      3,
      (sync.find_node_line({ "/* node a lives", "   here: a */", "a -> b;" }, "a"))
    )
  end)

  it("HTML strings `<...>` never match — inline and spanning lines", function()
    assert.are.equal(2, (sync.find_node_line({ "x [label=<a>];", "a -> b;" }, "a")))
    assert.are.equal(
      4,
      (sync.find_node_line({ "x [label=<", "  <b>a</b>", ">];", "a -> b;" }, "a"))
    )
  end)

  it("high bytes are ID bytes: `a` does not match the prefix of `añejo`", function()
    assert.are.equal(2, (sync.find_node_line({ "  añejo -> x;", "  a -> b;" }, "a")))
    -- and the unicode id itself is matchable bare
    assert.are.equal(1, (sync.find_node_line({ "  añejo -> x;" }, "añejo")))
  end)

  it("a bare-ineligible id (whitespace) only matches its quoted form", function()
    local lnum, col = sync.find_node_line({ "  indented -> x;", '" " -> z;' }, " ")
    assert.are.equal(2, lnum)
    assert.are.equal(1, col)
  end)

  it("numeral ids stay bare-matchable", function()
    assert.are.equal(1, (sync.find_node_line({ "5 -> 3;" }, "5")))
    assert.are.equal(1, (sync.find_node_line({ "x -> 3.14;" }, "3.14")))
  end)
end)

describe("sync.find_node_line — degraded inputs", function()
  it("returns nil when the node is absent (stale-browser path)", function()
    assert.is_nil(sync.find_node_line({ "a -> b;" }, "ghost"))
  end)

  it("returns nil for empty/non-string id and non-table lines", function()
    assert.is_nil(sync.find_node_line({ "a" }, ""))
    assert.is_nil(sync.find_node_line({ "a" }, nil))
    assert.is_nil(sync.find_node_line({ "a" }, 42))
    assert.is_nil(sync.find_node_line(nil, "a"))
  end)

  it("never errors on an unterminated quote", function()
    assert.is_nil(sync.find_node_line({ '"unterminated -> b;' }, "a"))
    assert.are.equal(1, (sync.find_node_line({ '"unterminated -> b;' }, "unterminated -> b;")))
  end)
end)

-- ── handle_node_click: buffer/window validation + cursor move (AC1/AC2) ──────

describe("sync.handle_node_click", function()
  before_each(reset)

  local function displayed_buffer(bufnr, lines)
    state.valid_bufs[bufnr] = true
    state.buf_lines[bufnr] = lines
    state.windows[bufnr] = { 1001 }
  end

  it("moves the cursor in a window displaying the buffer and returns true", function()
    displayed_buffer(3, { "digraph {", "  a -> b;", "}" })

    assert.is_true(sync.handle_node_click(3, "b"))
    assert.are.equal(1, #cursor_calls)
    assert.are.equal(1001, cursor_calls[1].winid)
    assert.are.same({ 2, 7 }, cursor_calls[1].pos) -- 1-based line, 0-based col
    assert.are.equal(0, #notify_calls)
  end)

  it("stale node: notifies, does not move the cursor, returns false (AC2)", function()
    displayed_buffer(3, { "a -> b;" })

    assert.is_false(sync.handle_node_click(3, "ghost"))
    assert.are.equal(0, #cursor_calls)
    assert.are.equal(1, #notify_calls)
    assert.truthy(notify_calls[1].msg:find("ghost", 1, true))
    assert.are.equal(vim.log.levels.INFO, notify_calls[1].level)
  end)

  it("invalid buffer: notifies and returns false without touching APIs", function()
    assert.is_false(sync.handle_node_click(99, "a"))
    assert.are.equal(0, #cursor_calls)
    assert.are.equal(1, #notify_calls)
  end)

  it("buffer not displayed in any window: notifies and returns false", function()
    state.valid_bufs[3] = true
    state.buf_lines[3] = { "a -> b;" }
    state.windows[3] = {}

    assert.is_false(sync.handle_node_click(3, "a"))
    assert.are.equal(0, #cursor_calls)
    assert.are.equal(1, #notify_calls)
  end)

  it("invalid inputs return false silently (server.lua already logged)", function()
    assert.is_false(sync.handle_node_click(nil, "a"))
    assert.is_false(sync.handle_node_click("3", "a"))
    assert.is_false(sync.handle_node_click(3, nil))
    assert.is_false(sync.handle_node_click(3, ""))
    assert.are.equal(0, #notify_calls)
    assert.are.equal(0, #cursor_calls)
  end)

  it("a throwing nvim_win_set_cursor is contained: notify + false, no error", function()
    displayed_buffer(3, { "a -> b;" })
    state.set_cursor_error = true

    assert.is_false(sync.handle_node_click(3, "a"))
    assert.are.equal(1, #notify_calls)
  end)

  it("prefers a window on the CURRENT tabpage over an earlier other-tab window", function()
    state.valid_bufs[3] = true
    state.buf_lines[3] = { "a -> b;" }
    state.windows[3] = { 2001, 1001 } -- other-tab window listed first
    state.win_tabs[2001] = 2
    state.win_tabs[1001] = 1
    state.current_tab = 1

    assert.is_true(sync.handle_node_click(3, "a"))
    assert.are.equal(1001, cursor_calls[1].winid)
    assert.are.equal(0, #notify_calls)
  end)

  it("cross-tab fallback still jumps but says so (no silent no-op)", function()
    state.valid_bufs[3] = true
    state.buf_lines[3] = { "a -> b;" }
    state.windows[3] = { 2001 } -- only displayed on another tab
    state.win_tabs[2001] = 2
    state.current_tab = 1

    assert.is_true(sync.handle_node_click(3, "a"))
    assert.are.equal(2001, cursor_calls[1].winid)
    assert.are.equal(1, #notify_calls)
    assert.truthy(notify_calls[1].msg:find("another tab", 1, true))
  end)
end)
