-- server.push_config unit spec (plan item #3): a re-run setup() pushes one
-- exact config_update envelope per open session; no server / no sessions is a
-- silent no-op that never spawns. Designed for plain busted (no Neovim): the
-- vim APIs config.lua touches at load/setup time are stubbed, log is stubbed,
-- and the REAL server.lua module is exercised with its send() replaced by a
-- spy (push_config dispatches through M.send, so no process is ever spawned).
package.path = "./lua/?.lua;./lua/?/init.lua;" .. package.path

_G.vim = {
  tbl_deep_extend = function(_, base, override)
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

package.loaded["interactive-graphviz.log"] = {
  warn = function(_) end,
  error = function(_) end,
  info = function(_) end,
  debug = function(_) end,
  notify = function(_) end,
}

local session = require("interactive-graphviz.session")
local config = require("interactive-graphviz.config")
local server = require("interactive-graphviz.server")

describe("server.push_config (config_update fan-out)", function()
  local sent

  before_each(function()
    sent = {}
    session.reset()
    config.setup({})
    -- A truthy handle marks "server exists"; the send spy keeps everything
    -- in-process (push_config calls M.send, never write_msg directly).
    server.state.handle = { fake = true }
    server.send = function(msg)
      table.insert(sent, msg)
      return true
    end
  end)

  after_each(function()
    server.state.handle = nil
    session.reset()
  end)

  it("no server → returns false, sends nothing (and never spawns one)", function()
    server.state.handle = nil
    session.register(3)
    assert.is_false(server.push_config())
    assert.are.equal(0, #sent)
  end)

  it("no open sessions → returns false, sends nothing", function()
    assert.is_false(server.push_config())
    assert.are.equal(0, #sent)
  end)

  it("sends one exact three-key config_update per open session with wire_params", function()
    session.register(3)
    session.register(7)
    config.setup({ animate = false, highlight_mode = "upstream" })

    assert.is_true(server.push_config())
    assert.are.equal(2, #sent)

    local by_id = {}
    for _, msg in ipairs(sent) do
      assert.are.equal("config_update", msg.type)
      by_id[msg.sessionId] = msg
      -- Exact envelope: type/sessionId/config, nothing else (no `v`, no data
      -- wrapping) — mirrors the server-side hasExactlyKeys contract.
      local keys = {}
      for k in pairs(msg) do
        keys[#keys + 1] = k
      end
      table.sort(keys)
      assert.are.same({ "config", "sessionId", "type" }, keys)
      -- The payload IS wire_params: all 7 keys, wire-encoded strings.
      assert.are.same(config.wire_params(), msg.config)
      assert.are.equal("0", msg.config.animate)
      assert.are.equal("upstream", msg.config.highlight_mode)
    end
    assert.truthy(by_id[3])
    assert.truthy(by_id[7])
  end)
end)
