-- Unit tests for config.lua: validation, defaults, expose_to_lan security invariant.
-- Designed to run under plain busted (no Neovim) as well as nvim+busted.
-- All vim APIs and plugin modules are stubbed via _G.vim + package.loaded injection.
package.path = "./lua/?.lua;./lua/?/init.lua;" .. package.path

-- ── vim stub ──────────────────────────────────────────────────────────────────

_G.vim = {
  tbl_deep_extend = function(mode, base, override)
    -- mode="force": override wins; shallow merge sufficient for flat defaults.
    local result = {}
    for k, v in pairs(base) do
      result[k] = v
    end
    for k, v in pairs(override or {}) do
      result[k] = v
    end
    return result
  end,
  deepcopy = function(t)
    -- Shallow copy is sufficient for the flat defaults table.
    if type(t) ~= "table" then
      return t
    end
    local copy = {}
    for k, v in pairs(t) do
      copy[k] = v
    end
    return copy
  end,
  log = { levels = { WARN = 3, ERROR = 4, INFO = 2, DEBUG = 0 } },
}

-- ── log stub ─────────────────────────────────────────────────────────────────

local warn_calls = {}

local log_stub = {
  warn = function(msg)
    table.insert(warn_calls, msg)
  end,
  error = function(_) end,
  info = function(_) end,
  debug = function(_) end,
  notify = function(_) end,
}

-- Pre-inject log stub so config.lua's `require("interactive-graphviz.log")` gets it.
package.loaded["interactive-graphviz.log"] = log_stub

-- Force-reload config on each test suite run (clear module cache).
package.loaded["interactive-graphviz.config"] = nil

local config = require("interactive-graphviz.config")

-- Helper: reset warn_calls and reload config between test groups.
local function reset()
  warn_calls = {}
  -- Reset log stub reference (it may have been re-injected).
  log_stub.warn = function(msg)
    table.insert(warn_calls, msg)
  end
  package.loaded["interactive-graphviz.log"] = log_stub
  -- Re-load config module to reset M.options to defaults.
  package.loaded["interactive-graphviz.config"] = nil
  config = require("interactive-graphviz.config")
end

-- ── test suite ────────────────────────────────────────────────────────────────

describe("config.setup — zero-config defaults", function()
  before_each(reset)

  it("M.setup() with no args returns all defaults with correct types", function()
    local opts = config.setup()
    assert.are.equal("dot", opts.engine)
    assert.are.equal("table", type(opts.engines))
    assert.are.equal(200, opts.debounce_ms)
    assert.are.equal("127.0.0.1", opts.bind)
    assert.are.equal(0, opts.port)
    assert.are.equal(false, opts.expose_to_lan)
    assert.is_nil(opts.open_cmd)
    assert.are.equal(true, opts.preserve_view)
    assert.are.equal(2000, opts.heartbeat_ms)
    assert.are.equal("warn", opts.log_level)
    assert.are.equal(0, #warn_calls, "no warnings on zero-config setup")
  end)

  it("M.setup({}) behaves identically to M.setup()", function()
    local opts = config.setup({})
    assert.are.equal("dot", opts.engine)
    assert.are.equal(200, opts.debounce_ms)
    assert.are.equal("127.0.0.1", opts.bind)
    assert.are.equal(0, opts.port)
    assert.are.equal(false, opts.expose_to_lan)
    assert.is_nil(opts.open_cmd)
    assert.are.equal(true, opts.preserve_view)
    assert.are.equal(2000, opts.heartbeat_ms)
    assert.are.equal("warn", opts.log_level)
    assert.are.equal(0, #warn_calls, "no warnings on empty-table setup")
  end)

  it("M.get() returns the current options after setup", function()
    config.setup({ debounce_ms = 300 })
    local opts = config.get()
    assert.are.equal(300, opts.debounce_ms)
    assert.are.equal("dot", opts.engine)
  end)
end)

describe("config.setup — valid overrides", function()
  before_each(reset)

  it("M.setup({ engine = 'neato' }) sets engine to 'neato'", function()
    local opts = config.setup({ engine = "neato" })
    assert.are.equal("neato", opts.engine)
    assert.are.equal(0, #warn_calls, "no warnings for valid engine")
  end)

  it("second call to M.setup overwrites the first (last-wins)", function()
    config.setup({ debounce_ms = 500 })
    local opts = config.setup({ debounce_ms = 750 })
    assert.are.equal(750, opts.debounce_ms)
    assert.are.equal(750, config.get().debounce_ms)
  end)
end)

describe("config.setup — invalid engine", function()
  before_each(reset)

  it("M.setup({ engine = 'invalid' }) resets engine to 'dot' and logs a warning", function()
    local opts = config.setup({ engine = "invalid" })
    assert.are.equal("dot", opts.engine)
    assert.are.equal(1, #warn_calls, "exactly one warning emitted")
    assert.truthy(warn_calls[1]:find("engine", 1, true), "warning message mentions 'engine'")
    assert.truthy(warn_calls[1]:find("invalid", 1, true), "warning message mentions the bad value")
  end)
end)

describe("config.setup — invalid debounce_ms", function()
  before_each(reset)

  it("M.setup({ debounce_ms = -1 }) resets debounce_ms to 200 and logs a warning", function()
    local opts = config.setup({ debounce_ms = -1 })
    assert.are.equal(200, opts.debounce_ms)
    assert.are.equal(1, #warn_calls, "exactly one warning emitted")
    assert.truthy(
      warn_calls[1]:find("debounce_ms", 1, true),
      "warning message mentions 'debounce_ms'"
    )
  end)

  it("M.setup({ debounce_ms = 0 }) resets debounce_ms to 200 and logs a warning", function()
    local opts = config.setup({ debounce_ms = 0 })
    assert.are.equal(200, opts.debounce_ms)
    assert.are.equal(1, #warn_calls)
  end)
end)

describe("config.setup — invalid log_level", function()
  before_each(reset)

  it("M.setup({ log_level = 'verbose' }) resets to 'warn' and logs a warning", function()
    local opts = config.setup({ log_level = "verbose" })
    assert.are.equal("warn", opts.log_level)
    assert.are.equal(1, #warn_calls, "exactly one warning emitted")
    assert.truthy(warn_calls[1]:find("log_level", 1, true), "warning message mentions 'log_level'")
    assert.truthy(warn_calls[1]:find("verbose", 1, true), "warning message mentions the bad value")
  end)

  it("all valid log_level values are accepted without warning", function()
    for _, level in ipairs({ "off", "error", "warn", "info", "debug" }) do
      reset()
      local opts = config.setup({ log_level = level })
      assert.are.equal(level, opts.log_level)
      assert.are.equal(0, #warn_calls, "no warning for valid log_level: " .. level)
    end
  end)
end)

describe("config.setup — expose_to_lan security invariant", function()
  before_each(reset)

  it("M.setup({ expose_to_lan = true }) sets bind to '0.0.0.0'", function()
    local opts = config.setup({ expose_to_lan = true })
    assert.are.equal("0.0.0.0", opts.bind)
    assert.are.equal(0, #warn_calls, "no warnings for valid expose_to_lan=true")
  end)

  it("M.setup({ expose_to_lan = false }) keeps bind at '127.0.0.1'", function()
    local opts = config.setup({ expose_to_lan = false })
    assert.are.equal("127.0.0.1", opts.bind)
    assert.are.equal(0, #warn_calls)
  end)

  it(
    "M.setup({ expose_to_lan = false, bind = '10.0.0.1' }) ignores explicit bind (security invariant)",
    function()
      local opts = config.setup({ expose_to_lan = false, bind = "10.0.0.1" })
      assert.are.equal(
        "127.0.0.1",
        opts.bind,
        "bind must always be loopback when expose_to_lan=false"
      )
      assert.are.equal(
        0,
        #warn_calls,
        "no warning — bind override is silent by design (security invariant)"
      )
    end
  )

  it("M.setup({ expose_to_lan = true, bind = '127.0.0.1' }) overrides bind to '0.0.0.0'", function()
    local opts = config.setup({ expose_to_lan = true, bind = "127.0.0.1" })
    assert.are.equal("0.0.0.0", opts.bind, "expose_to_lan=true always wins")
  end)

  it(
    "M.setup({ expose_to_lan = 1 }) resets to false and logs a warning (AC2: non-boolean)",
    function()
      local opts = config.setup({ expose_to_lan = 1 })
      assert.are.equal(false, opts.expose_to_lan)
      assert.are.equal("127.0.0.1", opts.bind, "invalid expose_to_lan resets to default (loopback)")
      assert.are.equal(1, #warn_calls, "warning emitted for non-boolean expose_to_lan")
      assert.truthy(warn_calls[1]:find("expose_to_lan", 1, true))
    end
  )
end)

describe("config.setup — port validation", function()
  before_each(reset)

  it("port = 0 (ephemeral) is valid", function()
    local opts = config.setup({ port = 0 })
    assert.are.equal(0, opts.port)
    assert.are.equal(0, #warn_calls)
  end)

  it("port = 3000 is valid", function()
    local opts = config.setup({ port = 3000 })
    assert.are.equal(3000, opts.port)
    assert.are.equal(0, #warn_calls)
  end)

  it("port = 65535 is valid (max)", function()
    local opts = config.setup({ port = 65535 })
    assert.are.equal(65535, opts.port)
    assert.are.equal(0, #warn_calls)
  end)

  it("port = -1 resets to 0 and logs a warning", function()
    local opts = config.setup({ port = -1 })
    assert.are.equal(0, opts.port)
    assert.are.equal(1, #warn_calls)
    assert.truthy(warn_calls[1]:find("port", 1, true))
  end)

  it("port = 99999 (out of range) resets to 0 and logs a warning", function()
    local opts = config.setup({ port = 99999 })
    assert.are.equal(0, opts.port)
    assert.are.equal(1, #warn_calls)
  end)
end)

describe("config.setup — engines validation", function()
  before_each(reset)

  it("custom engines list is accepted when valid", function()
    local opts = config.setup({ engines = { "dot", "neato", "fdp" }, engine = "fdp" })
    assert.are.equal(3, #opts.engines)
    assert.are.equal("fdp", opts.engine)
    assert.are.equal(0, #warn_calls)
  end)

  it("empty engines table resets to default and logs a warning", function()
    local opts = config.setup({ engines = {} })
    assert.are.equal(2, #opts.engines, "default engines restored")
    assert.are.equal("dot", opts.engines[1])
    assert.are.equal(1, #warn_calls)
    assert.truthy(warn_calls[1]:find("engines", 1, true))
  end)
end)

describe("config.set_engine", function()
  before_each(reset)

  it("accepts a valid runtime engine switch", function()
    config.setup()

    local ok, msg = config.set_engine("neato")

    assert.are.equal(true, ok)
    assert.is_nil(msg)
    assert.are.equal("neato", config.get().engine)
    assert.are.equal(0, #warn_calls, "runtime setter must not emit setup warnings")
  end)

  it("rejects an invalid runtime engine without mutating current engine", function()
    config.setup({ engine = "neato" })

    local ok, msg = config.set_engine("fdp")

    assert.are.equal(false, ok)
    assert.truthy(msg:find("unknown engine 'fdp'", 1, true))
    assert.truthy(msg:find("dot, neato", 1, true))
    assert.are.equal("neato", config.get().engine)
    assert.are.equal(0, #warn_calls, "runtime rejection must not emit setup warnings")
  end)

  it("uses the custom engines allowlist from setup", function()
    config.setup({ engines = { "dot", "neato", "fdp" } })

    local ok = config.set_engine("fdp")

    assert.are.equal(true, ok)
    assert.are.equal("fdp", config.get().engine)
  end)

  it("does not fall back to default after invalid runtime input", function()
    config.setup({ engines = { "dot", "neato", "fdp" }, engine = "fdp" })

    local ok = config.set_engine("bad")

    assert.are.equal(false, ok)
    assert.are.equal("fdp", config.get().engine)
  end)
end)

describe("config.setup — preserve_view validation", function()
  before_each(reset)

  it("preserve_view = false is valid", function()
    local opts = config.setup({ preserve_view = false })
    assert.are.equal(false, opts.preserve_view)
    assert.are.equal(0, #warn_calls)
  end)

  it("preserve_view = 'yes' resets to true and logs a warning", function()
    local opts = config.setup({ preserve_view = "yes" })
    assert.are.equal(true, opts.preserve_view)
    assert.are.equal(1, #warn_calls)
    assert.truthy(warn_calls[1]:find("preserve_view", 1, true))
  end)
end)

describe("config.setup — open_cmd validation", function()
  before_each(reset)

  it("open_cmd = nil is valid (default)", function()
    local opts = config.setup({ open_cmd = nil })
    assert.is_nil(opts.open_cmd)
    assert.are.equal(0, #warn_calls)
  end)

  it("open_cmd = 'xdg-open' is valid", function()
    local opts = config.setup({ open_cmd = "xdg-open" })
    assert.are.equal("xdg-open", opts.open_cmd)
    assert.are.equal(0, #warn_calls)
  end)

  it("open_cmd = '' (empty string) resets to nil and logs a warning", function()
    local opts = config.setup({ open_cmd = "" })
    assert.is_nil(opts.open_cmd)
    assert.are.equal(1, #warn_calls)
    assert.truthy(warn_calls[1]:find("open_cmd", 1, true))
  end)
end)
