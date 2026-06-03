local plugin = require("interactive-graphviz")

assert(type(plugin) == "table", "plugin module should return a table")
assert(type(plugin.setup) == "function", "plugin module should expose setup")
plugin.setup({})
