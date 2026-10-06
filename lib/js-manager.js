import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { BOT_ROOT, PLUGIN_ROOT } from './repo-manager.js'

const MAX_BYTES = 1024 * 1024
const JS_DIRECTORY = 'plugins/example'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

class JsManagerError extends Error {
  constructor (message, status = 400) {
    super(message)
    this.status = status
  }
}

function statOrNull (file) {
  try { return fs.lstatSync(file) } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

function checkSegment (value) {
  if (typeof value !== 'string' || !value || value.length > 128 || value.startsWith('.') ||
    value.includes('..') || /[\\/<>:"|?*\u0000-\u001f\u007f]/.test(value) || /[. ]$/.test(value) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) {
    throw new JsManagerError('目录或文件名不合法')
  }
}

function checkFileName (name) {
  checkSegment(name)
  if (!name.endsWith('.js') || name === '.js' || ['index.js', 'guoba.support.js'].includes(name.toLowerCase())) {
    throw new JsManagerError('请使用普通单文件插件名称（.js），不能使用 index.js 或 guoba.support.js')
  }
}

function contentBytes (content) {
  if (typeof content !== 'string') throw new JsManagerError('插件内容必须是文本')
  const bytes = Buffer.from(content, 'utf8')
  if (bytes.length > MAX_BYTES) throw new JsManagerError('单个 JS 插件最大为 1 MiB', 413)
  return bytes
}

function checkSyntax (bytes) {
  try {
    execFileSync(process.execPath, ['--check', '--input-type=module'], {
      input: bytes, timeout: 10000, maxBuffer: 65536, windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    })
  } catch (error) {
    const detail = String(error.stderr || error.message).trim().slice(0, 2000)
    throw new JsManagerError(`JS 语法检查未通过：\n${detail}`)
  }
}

export function createJsManager (botRoot = BOT_ROOT, historyRoot = path.join(PLUGIN_ROOT, 'config', 'js-history')) {
  botRoot = path.resolve(botRoot)
  historyRoot = path.resolve(historyRoot)

  function isPlainDirectory (directory) {
    const stat = statOrNull(directory)
    return stat?.isDirectory() && !stat.isSymbolicLink()
  }

  function directories () {
    const base = path.join(botRoot, 'plugins')
    const directory = path.join(base, 'example')
    if (statOrNull(base) && !isPlainDirectory(base)) return []
    if (statOrNull(directory) && !isPlainDirectory(directory)) return []
    return [JS_DIRECTORY]
  }

  function directoryOf (key, create = false) {
    if (typeof key !== 'string') throw new JsManagerError('缺少插件目录')
    if (key !== JS_DIRECTORY) throw new JsManagerError('JS 插件管理仅允许访问 plugins/example', 403)
    if (!directories().includes(key)) throw new JsManagerError('plugins/example 不是可管理的普通目录', 403)
    const directory = path.join(botRoot, 'plugins', 'example')
    if (create) fs.mkdirSync(directory, { recursive: true })
    const stat = statOrNull(directory)
    if (!stat) throw new JsManagerError('插件目录尚不存在', 404)
    if (!isPlainDirectory(directory)) throw new JsManagerError('目录状态已变化，请刷新页面', 409)
    const realBase = fs.realpathSync(botRoot)
    const realDir = fs.realpathSync(directory)
    if (!realDir.startsWith(realBase + path.sep)) throw new JsManagerError('插件目录超出允许范围', 403)
    return directory
  }

  function targetOf (key) {
    if (typeof key !== 'string') throw new JsManagerError('缺少插件文件')
    const parts = key.split('/')
    if (parts.length !== 3) throw new JsManagerError('插件路径不合法')
    const filename = parts[2]
    const enabled = !filename.endsWith('.js.disabled')
    const name = enabled ? filename : filename.slice(0, -'.disabled'.length)
    checkFileName(name)
    const directoryKey = parts.slice(0, 2).join('/')
    const directory = directoryOf(directoryKey)
    const file = path.join(directory, filename)
    if (!file.startsWith(directory + path.sep)) throw new JsManagerError('插件路径超出允许范围', 403)
    return { key, file, directory, directoryKey, name, enabled }
  }

  function read (key) {
    const target = targetOf(key)
    const stat = statOrNull(target.file)
    if (!stat) throw new JsManagerError('插件文件不存在，请刷新页面', 404)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1) {
      throw new JsManagerError('不能管理链接或非普通文件', 403)
    }
    if (stat.size > MAX_BYTES) throw new JsManagerError('单个 JS 插件最大为 1 MiB', 413)
    const bytes = fs.readFileSync(target.file)
    const content = bytes.toString('utf8')
    if (!Buffer.from(content, 'utf8').equals(bytes)) throw new JsManagerError('该插件不是 UTF-8 文本，无法在线编辑')
    return { target, bytes, stat, content, info: {
      key, name: target.name, directory: target.directoryKey, enabled: target.enabled,
      size: bytes.length, modifiedAt: stat.mtime.toISOString(), revision: digest(bytes)
    } }
  }

  function checkedRead (key, revision) {
    const current = read(key)
    if (typeof revision !== 'string' || revision !== current.info.revision) {
      throw new JsManagerError('插件内容已变化，请刷新或重新打开编辑器再操作', 409)
    }
    return current
  }

  function ensureVacant (directory, name) {
    if (statOrNull(path.join(directory, name)) || statOrNull(path.join(directory, `${name}.disabled`))) {
      throw new JsManagerError('同名插件已存在（含停用文件），请更换名称', 409)
    }
  }

  function historyDirectory () {
    fs.mkdirSync(historyRoot, { recursive: true, mode: 0o700 })
    const stat = fs.lstatSync(historyRoot)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new JsManagerError('备份目录不可用', 403)
    return historyRoot
  }

  function backup (current, kind) {
    const directory = historyDirectory()
    const id = randomUUID()
    const metadata = {
      id, kind, originalKey: current.target.key, createdAt: new Date().toISOString(),
      size: current.bytes.length, revision: current.info.revision, mode: current.stat.mode & 0o777
    }
    fs.writeFileSync(path.join(directory, `${id}.txt`), current.bytes, { flag: 'wx', mode: 0o600 })
    fs.writeFileSync(path.join(directory, `${id}.json`), JSON.stringify(metadata), { flag: 'wx', mode: 0o600 })
    return metadata
  }

  function list () {
    const directoryList = directories()
    const files = []
    const warnings = []
    for (const directoryKey of directoryList) {
      const dir = path.join(botRoot, ...directoryKey.split('/'))
      if (!statOrNull(dir)) continue
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile() || !/\.js(?:\.disabled)?$/.test(entry.name) ||
          ['index.js', 'guoba.support.js', 'guoba.support.js.disabled'].includes(entry.name.toLowerCase())) continue
        const key = `${directoryKey}/${entry.name}`
        try { files.push(read(key).info) } catch (error) { warnings.push(`${key}：${error.message}`) }
      }
    }
    return { directories: directoryList, files: files.sort((a, b) => a.key.localeCompare(b.key)), warnings }
  }

  function get (key) {
    const current = read(key)
    return { ...current.info, content: current.content }
  }

  function create ({ directory = JS_DIRECTORY, name, content, enabled = true }) {
    checkFileName(name)
    if (typeof enabled !== 'boolean') throw new JsManagerError('启用状态必须是布尔值')
    const bytes = contentBytes(content)
    checkSyntax(bytes)
    const dir = directoryOf(directory, true)
    ensureVacant(dir, name)
    const filename = enabled ? name : `${name}.disabled`
    fs.writeFileSync(path.join(dir, filename), bytes, { flag: 'wx', mode: 0o644 })
    return get(`${directory}/${filename}`)
  }

  function save ({ key, content, revision }) {
    const current = checkedRead(key, revision)
    const bytes = contentBytes(content)
    checkSyntax(bytes)
    if (digest(bytes) === current.info.revision) return get(key)
    backup(current, 'edit')
    const temporary = path.join(current.target.directory, `.${current.target.name}.${randomUUID()}.tmp`)
    try {
      fs.writeFileSync(temporary, bytes, { flag: 'wx', mode: current.stat.mode & 0o777 })
      fs.renameSync(temporary, current.target.file)
    } finally {
      if (statOrNull(temporary)) fs.unlinkSync(temporary)
    }
    return get(key)
  }

  function toggle ({ key, enabled, revision }) {
    if (typeof enabled !== 'boolean') throw new JsManagerError('启用状态必须是布尔值')
    const current = checkedRead(key, revision)
    if (current.target.enabled === enabled) return get(key)
    if (enabled) checkSyntax(current.bytes)
    const filename = enabled ? current.target.name : `${current.target.name}.disabled`
    const target = path.join(current.target.directory, filename)
    if (statOrNull(target)) throw new JsManagerError('目标文件已存在，不能覆盖同名插件', 409)
    fs.renameSync(current.target.file, target)
    return get(`${current.target.directoryKey}/${filename}`)
  }

  function trash ({ key, revision }) {
    const current = checkedRead(key, revision)
    const record = backup(current, 'trash')
    fs.unlinkSync(current.target.file)
    return record
  }

  function history () {
    if (!statOrNull(historyRoot)) return []
    const directory = historyDirectory()
    const records = []
    for (const filename of fs.readdirSync(directory)) {
      const id = filename.replace(/\.json$/, '')
      if (!filename.endsWith('.json') || !UUID_RE.test(id)) continue
      const file = path.join(directory, filename)
      const stat = statOrNull(file)
      if (!stat?.isFile() || stat.isSymbolicLink() || stat.size > 8192) continue
      try {
        const record = JSON.parse(fs.readFileSync(file, 'utf8'))
        if (record.id === id && ['edit', 'trash'].includes(record.kind) &&
          typeof record.originalKey === 'string' && record.originalKey.startsWith(`${JS_DIRECTORY}/`) &&
          record.originalKey.split('/').length === 3) records.push(record)
      } catch { /* Ignore incomplete backup metadata. */ }
    }
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  function restore ({ id }) {
    if (typeof id !== 'string' || !UUID_RE.test(id)) throw new JsManagerError('备份编号不合法')
    const record = history().find(item => item.id === id)
    if (!record) throw new JsManagerError('找不到回收站或备份记录', 404)
    const target = targetOf(record.originalKey)
    ensureVacant(target.directory, target.name)
    const contentFile = path.join(historyRoot, `${id}.txt`)
    const stat = statOrNull(contentFile)
    if (!stat?.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) throw new JsManagerError('备份文件不可用')
    const bytes = fs.readFileSync(contentFile)
    if (digest(bytes) !== record.revision) throw new JsManagerError('备份内容校验失败')
    fs.writeFileSync(target.file, bytes, { flag: 'wx', mode: record.mode ?? 0o644 })
    return get(record.originalKey)
  }

  return { list, get, create, save, toggle, trash, history, restore }
}

export const jsManager = createJsManager()
