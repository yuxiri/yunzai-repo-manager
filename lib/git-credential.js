import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { platformForHost } from './platforms.js'

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG_FILE = path.join(PLUGIN_ROOT, 'config', 'repo-config.json')

function readInput () {
  return new Promise(resolve => {
    let input = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => { input += chunk })
    process.stdin.on('end', () => resolve(input))
  })
}

const operation = process.argv[2] === '--yunzai-repo-manager-global' ? process.argv[3] : process.argv[2] || 'get'
if (operation === 'get') {
  try {
    const input = await readInput()
    const fields = Object.fromEntries(input.split(/\r?\n/).map(line => {
      const index = line.indexOf('=')
      return index < 0 ? ['', ''] : [line.slice(0, index), line.slice(index + 1)]
    }).filter(([key]) => key))
    const hostMatch = String(fields.host || '').match(/^([^:\s]+)(?::([0-9]+))?$/)
    const host = hostMatch && (!hostMatch[2] || (Number(hostMatch[2]) > 0 && Number(hostMatch[2]) <= 65535))
      ? hostMatch[1].toLowerCase() : ''
    const provider = fields.protocol === 'https' ? platformForHost(host)?.id : ''
    if (provider && fs.existsSync(CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
      const credential = config.credentials?.[provider] || {}
      // Never combine partial credentials with another helper's account or overwrite an explicitly selected account.
      const valid = value => typeof value === 'string' && value.length > 0 && !/[\r\n\u0000]/.test(value)
      if (valid(credential.username) && valid(credential.password) &&
        (!fields.username || fields.username === credential.username)) {
        process.stdout.write(`username=${credential.username}\npassword=${credential.password}\n\n`)
      }
    }
  } catch {
    // Returning no credentials lets Git continue with its next configured helper.
  }
}
