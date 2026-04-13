const { spawn } = require('node:child_process')
const path = require('node:path')

function run(name, command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
    shell: false,
  })

  child.on('exit', (code) => {
    if (code && code !== 0) {
      // eslint-disable-next-line no-console
      console.error(`[${name}] exited with code ${code}`)
      process.exitCode = code
    }
  })

  return child
}

const root = __dirname
const serverCwd = path.join(root, 'server')
const clientCwd = path.join(root, 'client')

run('server', 'node', ['index.js'], serverCwd)
run('client', 'node', ['node_modules/vite/bin/vite.js', '--host', '--port', '5173'], clientCwd)

