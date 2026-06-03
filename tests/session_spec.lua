-- Pure-Lua unit tests for the Lua-side session cache. session.lua uses no vim
-- APIs, so this runs under plain busted without a Neovim host.
package.path = "./lua/?.lua;./lua/?/init.lua;" .. package.path

describe("session registry (Lua-side cache)", function()
  local session = require("interactive-graphviz.session")

  before_each(function()
    session.reset()
  end)

  it("registers and counts buffers idempotently", function()
    session.register(1)
    session.register(1)
    session.register(2)
    assert.are.equal(2, session.count())
    assert.is_true(session.has(1))
  end)

  it("unregisters a buffer", function()
    session.register(7)
    session.unregister(7)
    assert.is_false(session.has(7))
    assert.are.equal(0, session.count())
  end)

  it("mints monotonic per-buffer versions independent of registration churn", function()
    assert.are.equal(1, session.next_version(3))
    assert.are.equal(2, session.next_version(3))
    session.unregister(3)
    assert.are.equal(3, session.next_version(3))
    assert.are.equal(1, session.next_version(99))
  end)

  it("reset clears active sessions and version counters", function()
    session.register(5)
    session.next_version(5)
    session.reset()
    assert.are.equal(0, session.count())
    assert.are.equal(1, session.next_version(5))
  end)
end)
