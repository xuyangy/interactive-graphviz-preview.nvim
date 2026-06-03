describe("repository scaffold", function()
  it("contains the Lua plugin entrypoints", function()
    assert.is_truthy(io.open("plugin/interactive-graphviz.lua", "r"))
    assert.is_truthy(io.open("lua/interactive-graphviz/init.lua", "r"))
  end)

  it("documents the canonical protocol source", function()
    local file = assert(io.open("lua/interactive-graphviz/protocol.lua", "r"))
    local content = file:read("*a")
    file:close()

    assert.truthy(content:find("server/protocol.ts is the canonical", 1, true))
  end)
end)
