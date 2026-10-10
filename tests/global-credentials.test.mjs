import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import https from 'node:https'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { test } from 'node:test'

const execAsync = promisify(execFile)
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const quote = value => `'${value.replaceAll('\\', '/').replaceAll("'", "'\\''")}'`
const originalEnvironment = { ...process.env }
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "yunzai credentials ' "))
const home = path.join(temporary, 'home')
const botRoot = path.join(temporary, 'Yunzai')
const addon = path.join(botRoot, 'plugins', 'yunzai-repo-manager')
fs.mkdirSync(home, { recursive: true })
fs.mkdirSync(path.dirname(addon), { recursive: true })
fs.cpSync(source, addon, { recursive: true, filter: file => !['.git', 'tests'].includes(path.basename(file)) })
fs.writeFileSync(path.join(botRoot, 'package.json'), '{"type":"module"}')
fs.mkdirSync(path.join(botRoot, 'lib', 'plugins'), { recursive: true })
fs.writeFileSync(path.join(botRoot, 'lib', 'plugins', 'plugin.js'), 'export default class Plugin { constructor(options) { this.options = options } }')
const globalFile = path.join(home, '.gitconfig')
const noSystemFile = path.join(home, 'empty-system-config')
fs.writeFileSync(noSystemFile, '')
const isolated = {
  ...originalEnvironment, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: path.join(home, '.config'),
  GIT_CONFIG_GLOBAL: globalFile, GIT_CONFIG_SYSTEM: noSystemFile, GIT_CONFIG_NOSYSTEM: '1',
  GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_CONFIG_COUNT: '0'
}
for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_CONFIG', 'GIT_ASKPASS', 'SSH_ASKPASS', 'GIT_TRACE', 'GIT_TRACE_CURL', 'GIT_CURL_VERBOSE']) delete isolated[key]
for (const key of Object.keys(process.env)) if (!(key in isolated)) delete process.env[key]
Object.assign(process.env, isolated)
const git = (directory, ...args) => execFileSync('git', ['-C', directory, ...args], {
  env: isolated, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
}).trim()
const gitAsync = (directory, args) => execAsync('git', ['-C', directory, ...args], {
  env: isolated, encoding: 'utf8', windowsHide: true, timeout: 30000
})
function helpers (directory, scope) {
  try { return git(directory, 'config', scope, '--get-all', 'credential.helper').split('\n') }
  catch (error) { if (error.status === 1) return []; throw error }
}
const userHelperFile = path.join(home, 'user-helper.mjs')
fs.writeFileSync(userHelperFile, `
import fs from 'node:fs'
if (process.argv[2] === 'get') {
  const input = fs.readFileSync(0, 'utf8')
  if (input.includes('host=other.example')) process.stdout.write('username=other-user\\npassword=other-password\\n\\n')
}
`)
const userHelper = `!${quote(process.execPath)} ${quote(userHelperFile)}`
git(botRoot, 'config', '--global', 'user.name', 'Preserved User')
git(botRoot, 'config', '--global', 'core.editor', 'preserved-editor')
git(botRoot, 'config', '--global', '--add', 'credential.helper', userHelper)
const includedFile = path.join(home, 'included.gitconfig')
fs.writeFileSync(includedFile, '[alias]\n\tkept = status --short\n[credential "https://other.example"]\n\tusername = other-user\n')
git(botRoot, 'config', '--global', '--add', 'include.path', includedFile.replaceAll('\\', '/'))
const includeBefore = fs.readFileSync(includedFile)
const makeRepo = (relative, remote) => {
  const dir = path.join(botRoot, ...relative.split('/'))
  fs.mkdirSync(dir, { recursive: true })
  git(dir, 'init')
  if (remote) git(dir, 'remote', 'add', 'origin', remote)
  return dir
}
const managedRepo = makeRepo('plugins/managed', 'https://github.com/example/managed.git')
const orphanRepo = makeRepo('user_plugins/no-origin')
const otherRepo = makeRepo('plugins/other', 'https://gitee.com/example/other.git')
const helperPath = path.join(addon, 'lib', 'git-credential.js')
const legacy = `!${quote(process.execPath)} ${quote(helperPath)}`
const alternateLegacy = `!${quote(process.platform === 'win32' ? 'C:/old-node/node.exe' : '/opt/old-node/bin/node')} ${quote(helperPath)}`
git(managedRepo, 'config', '--local', '--add', 'credential.helper', userHelper)
git(managedRepo, 'config', '--local', '--add', 'credential.helper', legacy)
git(managedRepo, 'config', '--local', '--add', 'credential.helper', alternateLegacy)
git(orphanRepo, 'config', '--local', '--add', 'credential.helper', legacy)
const lookalike = `!${quote(process.execPath)} ${quote(path.join(home, 'git-credential.js'))}`
git(orphanRepo, 'config', '--local', '--add', 'credential.helper', lookalike)
const manager = await import(pathToFileURL(path.join(addon, 'lib', 'repo-manager.js')))
const { supportGuoba } = await import(pathToFileURL(path.join(addon, 'guoba.support.js')))
const { createGlobalCredentialManager } = await import(pathToFileURL(path.join(addon, 'lib', 'global-credentials.js')))
const { jsManager } = await import(pathToFileURL(path.join(addon, 'lib', 'js-manager.js')))
const { RepoManager } = await import(pathToFileURL(path.join(addon, 'index.js')))
const Result = { ok: (data, message) => ({ success: true, data, message }), error: message => ({ success: false, message }) }
const save = data => supportGuoba().configInfo.setConfigData(data, { Result })
const configFile = path.join(addon, 'config', 'repo-config.json')
const accountData = {
  github: { username: 'github-test-user', password: 'github-test-token' },
  gitee: { username: 'gitee-test-user', password: 'gitee-test-token' },
  gitcode: { username: 'gitcode-test-user', password: 'gitcode-test-token' }
}
const fill = (directory, host, extra = '') => execFileSync('git', ['-C', directory, 'credential', 'fill'], {
  input: `protocol=https\nhost=${host}\n${extra}\n`, encoding: 'utf8', env: isolated, windowsHide: true,
  stdio: ['pipe', 'pipe', 'pipe']
})
const callHelper = (input, operation = 'get') => execFileSync(process.execPath, [helperPath, '--yunzai-repo-manager-global', operation], {
  input, encoding: 'utf8', env: isolated, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
})

test('global credentials, migrations, isolation, rollback, and existing functionality', async t => {
  try {
    await t.test('save installs global helper, preserves user settings, and cleans only owned local helpers', () => {
      const result = save({ credentials: accountData })
      assert.equal(result.success, true, result.message)
      assert.deepEqual(helpers(botRoot, '--global'), [userHelper, manager.globalCredentials.command])
      assert.deepEqual(helpers(managedRepo, '--local'), [userHelper])
      assert.deepEqual(helpers(orphanRepo, '--local'), [lookalike])
      assert.equal(git(botRoot, 'config', '--global', 'user.name'), 'Preserved User')
      assert.equal(git(botRoot, 'config', '--global', 'core.editor'), 'preserved-editor')
      assert.ok(fs.readFileSync(includedFile).equals(includeBefore))
      const before = fs.readFileSync(globalFile)
      assert.equal(save({}).success, true)
      assert.ok(fs.readFileSync(globalFile).equals(before), 'Repeated save must not duplicate or rewrite helpers')
      assert.equal(supportGuoba().configInfo.getConfigData().globalCredentialStatus.registered, true)
      assert.ok(supportGuoba().configInfo.schemas.some(item => item.field === 'globalCredentialStatus.summary' && item.componentProps.disabled))
    })

    await t.test('other plugins and clone working directories read isolated credentials via real Git', () => {
      for (const [host, provider] of [['github.com', 'github'], ['gitee.com', 'gitee'], ['gitcode.com', 'gitcode'], ['hub.gitcode.com', 'gitcode'], ['GITHUB.COM:443', 'github']]) {
        for (const dir of [otherRepo, home]) {
          const output = fill(dir, host)
          assert.ok(output.includes(`username=${accountData[provider].username}`))
          assert.ok(output.includes(`password=${accountData[provider].password}`))
          for (const [otherProvider, credential] of Object.entries(accountData)) {
            if (otherProvider !== provider) assert.ok(!output.includes(credential.password))
          }
        }
      }
      assert.ok(fill(otherRepo, 'other.example').includes('password=other-password'))
      for (const host of ['github.com.evil.test', 'evil.github.com', 'gitcode.com.evil.test', 'sub.gitcode.com', 'github.com:invalid']) {
        assert.equal(callHelper(`protocol=https\nhost=${host}\n\n`), '')
      }
      assert.equal(callHelper('protocol=http\nhost=github.com\n\n'), '')
      assert.equal(callHelper('protocol=https\nhost=github.com\nusername=another-account\n\n'), '')
      assert.equal(callHelper('protocol=https\nhost=github.com\n\n', 'store'), '')
      assert.equal(callHelper('protocol=https\nhost=github.com\n\n', 'erase'), '')
    })

    await t.test('edits and partial/full clearing take effect without storing tokens in Git config', () => {
      assert.equal(save({ 'credentials.github.password': 'github-updated-token' }).success, true)
      assert.ok(fill(otherRepo, 'github.com').includes('password=github-updated-token'))
      assert.equal(save({ 'credentials.github.password': '' }).success, true)
      assert.equal(callHelper('protocol=https\nhost=github.com\n\n'), '')
      assert.throws(() => fill(otherRepo, 'github.com'))
      assert.ok(fill(otherRepo, 'gitee.com').includes('password=gitee-test-token'))
      assert.equal(save({ credentials: accountData }).success, true)
      const globalContent = fs.readFileSync(globalFile, 'utf8')
      for (const { password } of Object.values(accountData)) {
        assert.ok(!globalContent.includes(password))
        assert.ok(!fs.readFileSync(path.join(managedRepo, '.git', 'config'), 'utf8').includes(password))
      }
      assert.equal(save({ 'credentials.github.password': 'bad\npassword=unsafe' }).success, false)
    })

    await t.test('global write failure rolls back both account file and changed remote with safe panel errors', () => {
      const before = fs.readFileSync(configFile)
      const origin = git(managedRepo, 'remote', 'get-url', 'origin')
      const lock = `${globalFile}.lock`
      fs.writeFileSync(lock, 'test lock')
      const empty = Object.fromEntries(Object.keys(accountData).map(id => [id, { username: '', password: '' }]))
      let result
      try {
        result = save({ credentials: empty, repositories: {
          [manager.repoFieldId('plugins/managed')]: { provider: 'gitee', giteeUrl: 'https://gitee.com/example/mirror.git' }
        } })
      } finally { fs.unlinkSync(lock) }
      assert.equal(result.success, false)
      assert.match(result.message, /全局 Git 认证同步失败/)
      assert.ok(fs.readFileSync(configFile).equals(before))
      assert.equal(git(managedRepo, 'remote', 'get-url', 'origin'), origin)
      for (const { password } of Object.values(accountData)) assert.ok(!result.message.includes(password))
      assert.match(manager.globalCredentials.status(manager.loadConfig()).summary, /同步失败/)
    })

    await t.test('migration failure rolls back new registration and leaves user helpers intact', () => {
      git(botRoot, 'config', '--global', '--unset-all', 'credential.helper', '^' + manager.globalCredentials.command.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&') + '$')
      git(managedRepo, 'config', '--local', '--add', 'credential.helper', legacy)
      const lock = path.join(managedRepo, '.git', 'config.lock')
      fs.writeFileSync(lock, 'test lock')
      try { assert.throws(() => manager.globalCredentials.sync(manager.loadConfig()), /旧 helper 清理失败/) }
      finally { fs.unlinkSync(lock) }
      assert.deepEqual(helpers(botRoot, '--global'), [userHelper])
      assert.deepEqual(helpers(managedRepo, '--local'), [userHelper, legacy])
      assert.equal(save({}).success, true)
    })

    await t.test('respects user helper precedence and reports reset/conflict states', () => {
      const precedenceHelper = path.join(home, 'precedence.mjs')
      fs.writeFileSync(precedenceHelper, `if(process.argv[2]==='get') process.stdout.write('username=existing-user\\npassword=existing-password\\n\\n')`)
      const priorGlobal = fs.readFileSync(globalFile)
      try {
        git(botRoot, 'config', '--global', '--unset-all', 'credential.helper')
        git(botRoot, 'config', '--global', '--add', 'credential.helper', `!${quote(process.execPath)} ${quote(precedenceHelper)}`)
        assert.equal(save({}).success, true)
        assert.ok(fill(otherRepo, 'github.com').includes('password=existing-password'))
        assert.ok(manager.globalCredentials.status(manager.loadConfig()).warnings.some(message => message.includes('优先生效')))
        git(botRoot, 'config', '--global', '--add', 'credential.helper', '')
        assert.ok(manager.globalCredentials.status(manager.loadConfig()).warnings.some(message => message.includes('重置')))
      } finally { fs.writeFileSync(globalFile, priorGlobal) }
      git(otherRepo, 'config', '--local', '--add', 'credential.helper', '')
      assert.ok(manager.globalCredentials.status(manager.loadConfig()).warnings.some(message => message.includes('本地助手列表')))
      git(otherRepo, 'config', '--local', '--unset-all', 'credential.helper')
    })

    await t.test('repository switching, bot commands, and fixed example JS management still work', async () => {
      const result = save({ repositories: {
        [manager.repoFieldId('plugins/managed')]: { provider: 'gitcode', gitcodeUrl: 'https://hub.gitcode.com/example/managed.git', giteeUrl: '' }
      } })
      assert.equal(result.success, true, result.message)
      assert.equal(git(managedRepo, 'remote', 'get-url', 'origin'), 'https://hub.gitcode.com/example/managed.git')
      const beforeInvalid = fs.readFileSync(configFile)
      assert.equal(save({ repositories: { [manager.repoFieldId('plugins/managed')]: { provider: 'gitee', giteeUrl: '' } } }).success, false)
      assert.ok(fs.readFileSync(configFile).equals(beforeInvalid))
      manager.switchRepository(manager.findRepository('managed'), 'github')
      assert.equal(git(managedRepo, 'remote', 'get-url', 'origin'), 'https://github.com/example/managed.git')
      const app = new RepoManager()
      app.e = { isMaster: true, msg: '#仓库切换 managed gitcode' }
      let reply = ''
      app.reply = async message => { reply = message }
      assert.equal(await app.switchRepo(), true)
      assert.match(reply, /已将/)
      assert.deepEqual(jsManager.list().directories, ['plugins/example'])
      assert.throws(() => jsManager.create({ directory: 'plugins/other', name: 'blocked.js', content: 'export const x=1' }), /仅允许/)
      const created = jsManager.create({ name: 'example.js', content: 'export const x=1' })
      const edited = jsManager.save({ key: created.key, revision: created.revision, content: 'export const x=2' })
      const disabled = jsManager.toggle({ key: edited.key, revision: edited.revision, enabled: false })
      const trashed = jsManager.trash({ key: disabled.key, revision: disabled.revision })
      assert.equal(jsManager.restore({ id: trashed.id }).enabled, false)
    })

    await t.test('HTTPS clone, fetch, and pull authenticate through global helper against a local test server', async () => {
      const cert = path.join(home, 'test-cert.pem')
      const key = path.join(home, 'test-key.pem')
      const openssl = process.platform === 'win32' && fs.existsSync('C:/Program Files/Git/usr/bin/openssl.exe')
        ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl'
      execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert,
        '-days', '1', '-subj', '/CN=localhost'], { env: isolated, windowsHide: true, stdio: 'pipe' })
      const authorRepo = makeRepo('test-author')
      git(authorRepo, 'config', 'user.email', 'test@example.invalid')
      git(authorRepo, 'config', 'commit.gpgsign', 'false')
      fs.writeFileSync(path.join(authorRepo, 'sample.txt'), 'one')
      git(authorRepo, 'add', '.')
      git(authorRepo, 'commit', '-m', 'first')
      const bare = path.join(home, 'remote.git')
      git(home, 'clone', '--bare', authorRepo, bare)
      git(bare, 'update-server-info')
      const authorized = new Set()
      let wrongAccount = false
      const server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (req, res) => {
        const host = req.headers.host.split(':')[0]
        const provider = host === 'github.com' ? 'github' : host === 'gitee.com' ? 'gitee' : 'gitcode'
        const credential = accountData[provider]
        const expected = 'Basic ' + Buffer.from(`${credential.username}:${credential.password}`).toString('base64')
        if (req.headers.authorization !== expected) {
          if (req.headers.authorization) wrongAccount = true
          res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="test"' }); res.end(); return
        }
        authorized.add(host)
        const requested = new URL(req.url, 'https://localhost').pathname.replace(/^\/remote\.git\//, '')
        const file = path.resolve(bare, requested)
        if (!file.startsWith(bare + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          res.writeHead(404); res.end(); return
        }
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        fs.createReadStream(file).pipe(res)
      })
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
      const port = server.address().port
      const options = ['-c', 'http.sslVerify=false', '-c', 'http.proxy=', '-c',
        `http.curloptResolve=github.com:${port}:127.0.0.1`, '-c', `http.curloptResolve=gitee.com:${port}:127.0.0.1`,
        '-c', `http.curloptResolve=gitcode.com:${port}:127.0.0.1`, '-c', `http.curloptResolve=hub.gitcode.com:${port}:127.0.0.1`]
      try {
        for (const host of ['github.com', 'gitee.com', 'gitcode.com', 'hub.gitcode.com']) {
          const cloneDir = path.join(home, `clone-${host}`)
          await gitAsync(home, [...options, 'clone', `https://${host}:${port}/remote.git`, cloneDir])
          await gitAsync(cloneDir, [...options, 'fetch', 'origin'])
          await gitAsync(cloneDir, [...options, 'pull', '--ff-only'])
          assert.equal(fs.readFileSync(path.join(cloneDir, 'sample.txt'), 'utf8'), 'one')
        }
        assert.equal(authorized.size, 4)
        assert.equal(wrongAccount, false)
      } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
    })

    await t.test('clear all unregisters only this plugin and leaves unrelated credentials and includes available', () => {
      const empty = Object.fromEntries(Object.keys(accountData).map(id => [id, { username: '', password: '' }]))
      assert.equal(save({ credentials: empty }).success, true)
      assert.deepEqual(helpers(botRoot, '--global'), [userHelper])
      for (const host of ['github.com', 'gitee.com', 'gitcode.com', 'hub.gitcode.com']) assert.throws(() => fill(otherRepo, host))
      assert.ok(fill(otherRepo, 'other.example').includes('password=other-password'))
      assert.equal(manager.globalCredentials.status(manager.loadConfig()).registered, false)
      assert.equal(git(botRoot, 'config', '--global', 'user.name'), 'Preserved User')
      assert.equal(git(botRoot, 'config', '--global', '--includes', 'alias.kept'), 'status --short')
      assert.ok(fs.readFileSync(includedFile).equals(includeBefore))
      const args = []
      createGlobalCredentialManager({ pluginRoot: addon, botRoot, execute: (directory, argv) => { args.push(argv); return '' } }).sync({ credentials: accountData })
      assert.ok(args.some(argv => argv.includes('--global') && argv.includes('--add')))
      assert.ok(!args.some(argv => argv.includes('--system')))
      for (const argv of args) for (const { password } of Object.values(accountData)) assert.ok(!argv.join(' ').includes(password))
    })
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key]
    Object.assign(process.env, originalEnvironment)
    // Keep the fixture for inspection. Only fake credentials and a one-day test certificate are used.
  }
})
