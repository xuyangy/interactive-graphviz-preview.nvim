-- Headless-Neovim integration test for NFR-3 (no orphans) and the
-- one-server-per-instance falsification gate.
--
-- Runs under plain busted (Lua 5.1): it orchestrates a real headless Neovim child
-- via the shell, kills it with -9 (so VimLeavePre never fires), and asserts the
-- server it spawned is reaped. Requires `nvim` and `bun` on PATH.

local function shell(cmd)
  local handle = assert(io.popen(cmd))
  local out = handle:read("*a") or ""
  handle:close()
  return out
end

local function trim(s)
  return (s:gsub("%s+", ""))
end

local function alive(pid)
  return trim(shell("kill -0 " .. pid .. " 2>/dev/null; echo $?")) == "0"
end

describe("no-orphan supervision (NFR-3 gate)", function()
  it("reaps the server when the parent Neovim is killed -9", function()
    local pid_file = os.tmpname()
    os.remove(pid_file)

    -- IG_HEARTBEAT_TIMEOUT_MS is set far above the reap window below so this gate
    -- can ONLY pass via the load-bearing stdin-EOF path, never the heartbeat backstop.
    local launch = string.format(
      "IG_PID_FILE=%s IG_HEARTBEAT_TIMEOUT_MS=30000 "
        .. "nvim --headless -u tests/minimal_init.lua -l tests/integration/orphan_child.lua "
        .. ">/dev/null 2>&1 & echo $!",
      pid_file
    )
    local child_pid = trim(shell(launch))
    assert.is_truthy(child_pid:match("^%d+$"))

    local server_pid
    for _ = 1, 150 do
      local f = io.open(pid_file, "r")
      if f then
        local content = trim(f:read("*a") or "")
        f:close()
        if content ~= "" then
          server_pid = content
          break
        end
      end
      os.execute("sleep 0.1")
    end

    assert.is_truthy(server_pid, "server never recorded a PID")
    assert.are_not.equal("ERROR_NOT_READY", server_pid)
    assert.is_true(alive(server_pid), "server should be alive before the kill")

    os.execute("kill -9 " .. child_pid)

    local reaped = false
    for _ = 1, 60 do
      if not alive(server_pid) then
        reaped = true
        break
      end
      os.execute("sleep 0.1")
    end

    os.remove(pid_file)
    if not reaped then
      os.execute("kill -9 " .. server_pid .. " 2>/dev/null")
    end
    assert.is_true(reaped, "server was orphaned after parent kill -9")
  end)
end)
