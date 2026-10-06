import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  PLATFORMS,
  PLATFORM_IDS,
  REPOSITORY_PROVIDERS,
  REPOSITORY_URL_FIELDS,
  platformForHost
} from './platforms.js'

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url))
export const PLUGIN_ROOT = path.resolve(LIB_DIR, '..')
export const BOT_ROOT = path.resolve(PLUGIN_ROOT, '..', '..')
const CONFIG_DIR = path.join(PLUGIN_ROOT, 'config')
const CONFIG_FILE = path.join(CONFIG_DIR, 'repo-config.json')
const DEFAULT_FILE = path.join(CONFIG_DIR, 'default.json')
const HELPER_FILE = path.join(LIB_DIR, 'git-credential.js')

const emptyConfig = () => ({
  credentials: Object.fromEntries(PLATFORM_IDS.map(id => [id, { username: '', password: '' }])),
  repositories: {}
})

export function loadConfig () {
  try {
    const loaded = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    const defaults = emptyConfig()
    return {
      ...defaults,
      ...loaded,
      credentials: Object.fromEntries(PLATFORM_IDS.map(id => [id, {
        ...defaults.credentials[id], ...loaded.credentials?.[id]
      }])),
      repositories: loaded.repositories && typeof loaded.repositories === 'object'
        ? loaded.repositories
        : {}
    }
  } catch {
    try {
      return JSON.parse(fs.readFileSync(DEFAULT_FILE, 'utf8'))
    } catch {
      return emptyConfig()
    }
  }
}

export function saveConfig (config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  const serialized = `${JSON.stringify(config, null, 2)}\n`
  fs.writeFileSync(CONFIG_FILE, serialized, { encoding: 'utf8', mode: 0o600 })
  try {
    fs.chmodSync(CONFIG_FILE, 0o600)
  } catch {
    // Windows does not expose POSIX file modes; the file remains local to the plugin.
  }
}

function git (directory, args) {
  return execFileSync('git', ['-C', directory, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 8000,
    windowsHide: true
  }).trim()
}

export function listRepositories () {
  const results = []
  const pluginRoots = ['plugins', 'user_plugins']

  for (const rootName of pluginRoots) {
    const root = path.join(BOT_ROOT, rootName)
    if (!fs.existsSync(root)) continue

    let entries
    try {
      entries = fs.readdirSync(root, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const directory = path.resolve(root, entry.name)
      if (directory === PLUGIN_ROOT) continue
      if (!fs.existsSync(path.join(directory, '.git'))) continue

      try {
        const insideWorktree = git(directory, ['rev-parse', '--is-inside-work-tree'])
        if (insideWorktree !== 'true') continue
        const origin = git(directory, ['remote', 'get-url', 'origin'])
        results.push({
          key: `${rootName}/${entry.name}`,
          name: entry.name,
          directory,
          origin
        })
      } catch {
        // Non-git folders and repositories without an origin are not configurable here.
      }
    }
  }

  return results.sort((a, b) => a.key.localeCompare(b.key))
}

export function repoFieldId (key) {
  return Buffer.from(key, 'utf8').toString('base64url')
}

export function providerForUrl (remote) {
  const host = getHost(remote)
  const ssh = !/^https?:\/\//i.test(String(remote || ''))
  return platformForHost(host, ssh)?.id || 'custom'
}

function getHost (remote) {
  const value = String(remote || '').trim()
  try {
    if (/^https?:\/\//i.test(value) || /^ssh:\/\//i.test(value)) {
      return new URL(value).hostname.toLowerCase()
    }
  } catch {
    return ''
  }
  const scp = value.match(/^(?:[^@\s]+@)?([^:/\s]+):[^\s]+$/)
  return scp?.[1]?.toLowerCase() || ''
}

function withoutHttpCredentials (remote) {
  const value = String(remote || '').trim()
  try {
    if (/^https?:\/\//i.test(value)) {
      const parsed = new URL(value)
      parsed.username = ''
      parsed.password = ''
      return parsed.toString().replace(/\/$/, '')
    }
  } catch {
    return ''
  }
  return value
}

export function getRepositorySettings (repo, config) {
  const saved = config.repositories?.[repo.key] || {}
  const detected = providerForUrl(repo.origin)
  const settings = {
    provider: saved.provider || detected,
  }
  for (const provider of REPOSITORY_PROVIDERS) {
    const field = `${provider}Url`
    settings[field] = Object.hasOwn(saved, field)
      ? String(saved[field] ?? '').trim()
      : detected === provider ? withoutHttpCredentials(repo.origin) : ''
  }
  return settings
}

function selectedRemote (settings, repo) {
  const label = PLATFORMS.find(platform => platform.id === settings.provider)?.label || '自定义'
  const remote = settings[`${settings.provider}Url`]
  if (!remote) throw new Error(`插件 ${repo.key} 未填写 ${label} 地址，请先填写地址或选择已有平台`)
  return validateRemote(remote, settings.provider)
}

function validateRemote (remote, provider) {
  const value = String(remote || '').trim()
  if (!value || value.length > 512 || /[\u0000-\u0020\u007f]/.test(value)) {
    throw new Error('仓库地址不能为空，且不能包含空白字符')
  }

  let host = ''
  let protocol = ''
  try {
    if (/^https:\/\//i.test(value) || /^ssh:\/\//i.test(value)) {
      const parsed = new URL(value)
      protocol = parsed.protocol.toLowerCase()
      host = parsed.hostname.toLowerCase()
      if (parsed.password || (protocol === 'https:' && parsed.username)) {
        throw new Error('仓库地址不能内嵌用户名或密码')
      }
      if (parsed.search || parsed.hash) throw new Error('仓库地址不能包含查询参数或片段')
      if (!parsed.pathname || parsed.pathname === '/') throw new Error('仓库地址缺少仓库路径')
    } else {
      const scp = value.match(/^(?:[A-Za-z0-9._-]+@)?([A-Za-z0-9.-]+):([^\s:][^\s]*)$/)
      if (!scp) throw new Error('只支持 HTTPS、SSH 或 git@host:path 格式的仓库地址')
      host = scp[1].toLowerCase()
      protocol = 'ssh:'
    }
  } catch (error) {
    if (error instanceof TypeError) throw new Error('仓库地址格式无效')
    throw error
  }

  const platform = PLATFORMS.find(item => item.id === provider)
  if (platform && platformForHost(host, protocol === 'ssh:')?.id !== provider) {
    throw new Error(`${platform.label} 地址必须使用 ${platform.hosts.join(' 或 ')}${platform.sshDomain ? '（SSH 也支持该平台子域名）' : ''}`)
  }
  if (provider === 'custom' && !['https:', 'ssh:'].includes(protocol)) {
    throw new Error('自定义仓库仅支持 HTTPS 或 SSH')
  }
  return value
}

function credentialHelperCommand () {
  const node = process.execPath.replaceAll('\\', '/')
  const helper = HELPER_FILE.replaceAll('\\', '/')
  const quote = value => `'${value.replaceAll("'", "'\\''")}'`
  return `!${quote(node)} ${quote(helper)}`
}

function ensureCredentialHelper (directory) {
  const command = credentialHelperCommand()
  let existing = []
  try {
    existing = git(directory, ['config', '--local', '--get-all', 'credential.helper'])
      .split(/\r?\n/)
      .filter(Boolean)
  } catch {
    // No local helper is configured yet.
  }
  if (!existing.includes(command)) {
    git(directory, ['config', '--local', '--add', 'credential.helper', command])
  }
}

function usesManagedHttpsCredentials (remote) {
  return /^https:\/\//i.test(remote) && Boolean(platformForHost(getHost(remote)))
}

function normalizeFormData (data) {
  if (!data || typeof data !== 'object') return {}
  const result = { ...data }
  const flatten = (object, prefix = '') => {
    for (const [key, value] of Object.entries(object)) {
      const field = prefix ? `${prefix}.${key}` : key
      if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, field)
      else if (!(field in result)) result[field] = value
    }
  }
  flatten(data)
  return result
}

export function saveGuobaData (data, Result) {
  const flattened = normalizeFormData(data)
  const currentConfig = loadConfig()
  const nextConfig = {
    ...currentConfig,
    credentials: Object.fromEntries(PLATFORM_IDS.map(id => [id, { ...currentConfig.credentials[id] }])),
    repositories: { ...currentConfig.repositories }
  }

  for (const provider of PLATFORM_IDS) {
    for (const field of ['username', 'password']) {
      const key = `credentials.${provider}.${field}`
      if (Object.hasOwn(flattened, key)) {
        const value = String(flattened[key] ?? '')
        if (/[\r\n\u0000]/.test(value)) throw new Error(`${provider} 凭据不能包含换行符`)
        nextConfig.credentials[provider][field] = value
      }
    }
  }

  const repos = listRepositories()
  const plans = []
  for (const repo of repos) {
    const id = repoFieldId(repo.key)
    const prefix = `repositories.${id}`
    const providerField = `${prefix}.provider`
    if (!Object.hasOwn(flattened, providerField)) continue

    const previous = getRepositorySettings(repo, currentConfig)
    const settings = {
      ...previous,
      provider: String(flattened[providerField] || previous.provider)
    }
    for (const field of REPOSITORY_URL_FIELDS) {
      const fieldKey = `${prefix}.${field}`
      if (Object.hasOwn(flattened, fieldKey)) {
        settings[field] = String(flattened[fieldKey] ?? '').trim()
      }
    }
    if (!REPOSITORY_PROVIDERS.includes(settings.provider)) {
      throw new Error(`插件 ${repo.key} 的仓库类型无效`)
    }

    plans.push({
      repo,
      target: selectedRemote(settings, repo),
      settings
    })
    nextConfig.repositories[repo.key] = settings
  }

  const changed = []
  try {
    for (const plan of plans) {
      if (plan.target !== plan.repo.origin) {
        git(plan.repo.directory, ['remote', 'set-url', 'origin', plan.target])
        changed.push(plan.repo)
      }
    }

    const hasCredentials = PLATFORM_IDS.some(provider => {
      const credential = nextConfig.credentials[provider]
      return credential.username || credential.password
    })
    if (hasCredentials) {
      const plannedRemotes = new Map(plans.map(plan => [plan.repo.key, plan.target]))
      for (const repo of repos) {
        const remote = plannedRemotes.get(repo.key) || repo.origin
        if (usesManagedHttpsCredentials(remote)) ensureCredentialHelper(repo.directory)
      }
    }
    saveConfig(nextConfig)
  } catch (error) {
    for (const repo of changed.reverse()) {
      try {
        git(repo.directory, ['remote', 'set-url', 'origin', repo.origin])
      } catch {
        // Preserve the original failure; the affected repo path is reported below.
      }
    }
    throw new Error(`保存失败：${error.message}`)
  }

  return Result.ok({}, `配置已保存，切换了 ${changed.length} 个插件仓库地址`)
}

export function switchRepository (repo, provider, config = loadConfig()) {
  if (!REPOSITORY_PROVIDERS.includes(provider)) {
    throw new Error('仓库类型应为 github、gitee、gitcode 或 custom')
  }
  const settings = getRepositorySettings(repo, config)
  const target = selectedRemote({ ...settings, provider }, repo)
  if (target !== repo.origin) git(repo.directory, ['remote', 'set-url', 'origin', target])
  config.repositories[repo.key] = { ...settings, provider }
  const hasCredentials = PLATFORM_IDS.some(name => {
    const credential = config.credentials[name]
    return credential.username || credential.password
  })
  if (hasCredentials && usesManagedHttpsCredentials(target)) ensureCredentialHelper(repo.directory)
  saveConfig(config)
  return target
}

export function findRepository (identifier) {
  const repos = listRepositories()
  const exact = repos.find(repo => repo.key === identifier)
  if (exact) return exact
  const matches = repos.filter(repo => repo.name === identifier)
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) {
    throw new Error(`目录名 ${identifier} 不唯一，请使用完整路径，例如 ${matches[0].key}`)
  }
  throw new Error(`未找到 Git 插件仓库：${identifier}`)
}

export function formatRepositoryList () {
  const repos = listRepositories()
  if (!repos.length) return '没有发现带 origin 的 Git 插件仓库。'
  return repos.map(repo => `${repo.key}\n  ${repo.origin}`).join('\n')
}

export function getGuobaConfigData () {
  const config = loadConfig()
  const data = {
    credentials: config.credentials,
    repositories: {}
  }
  for (const repo of listRepositories()) {
    data.repositories[repoFieldId(repo.key)] = getRepositorySettings(repo, config)
  }
  return data
}

export function getGuobaSchemas () {
  const schemas = [
    { label: 'Git 账号凭据', component: 'SOFT_GROUP_BEGIN' },
    {
      field: 'credentials.github.username',
      label: 'GitHub 用户名',
      component: 'Input',
      componentProps: { placeholder: 'GitHub 用户名' }
    },
    {
      field: 'credentials.github.password',
      label: 'GitHub Token / 密码',
      bottomHelpMessage: 'GitHub HTTPS Git 操作请填写 Personal Access Token；账号登录密码已不能用于 Git。',
      component: 'InputPassword',
      componentProps: { placeholder: '建议使用权限受限的 Token' }
    },
    {
      field: 'credentials.gitee.username',
      label: 'Gitee 用户名',
      component: 'Input',
      componentProps: { placeholder: 'Gitee 用户名' }
    },
    {
      field: 'credentials.gitee.password',
      label: 'Gitee 密码 / Token',
      bottomHelpMessage: 'HTTPS Git 操作使用；SSH 地址不会使用此凭据。',
      component: 'InputPassword',
      componentProps: { placeholder: '密码或访问令牌' }
    },
    {
      field: 'credentials.gitcode.username',
      label: 'GitCode 用户名',
      component: 'Input',
      componentProps: { placeholder: 'GitCode 用户名' }
    },
    {
      field: 'credentials.gitcode.password',
      label: 'GitCode 密码 / Token',
      bottomHelpMessage: '填写平台提供的 HTTPS 凭据或个人访问令牌；SSH 地址使用 SSH key。',
      component: 'InputPassword',
      componentProps: { placeholder: 'HTTPS 密码或访问令牌' }
    },
    {
      label: '插件仓库地址',
      component: 'SOFT_GROUP_BEGIN'
    },
    {
      label: '没有的仓库地址留空即可。仅自动填入当前 origin 所属平台的地址；保存时只检查所选平台。新装插件后重启 Yunzai 刷新列表。',
      component: 'Divider'
    }
  ]

  const repos = listRepositories()
  if (!repos.length) {
    schemas.push({
      label: '未发现带 origin 的 Git 插件仓库。',
      component: 'Divider'
    })
    return schemas
  }

  for (const repo of repos) {
    const id = repoFieldId(repo.key)
    const prefix = `repositories.${id}`
    schemas.push(
      { label: repo.key, component: 'Divider' },
      {
        field: `${prefix}.provider`,
        label: '当前仓库平台',
        component: 'Select',
        componentProps: {
          options: [
            ...PLATFORMS.map(({ id, label }) => ({ label, value: id })),
            { label: '自定义', value: 'custom' }
          ]
        }
      },
      {
        field: `${prefix}.githubUrl`,
        label: 'GitHub 地址',
        component: 'Input',
        componentProps: { placeholder: 'https://github.com/owner/repo.git（没有则留空）' }
      },
      {
        field: `${prefix}.giteeUrl`,
        label: 'Gitee 地址',
        component: 'Input',
        componentProps: { placeholder: 'https://gitee.com/owner/repo.git（没有则留空）' }
      },
      {
        field: `${prefix}.gitcodeUrl`,
        label: 'GitCode 地址',
        component: 'Input',
        componentProps: { placeholder: 'https://gitcode.com/owner/repo.git（没有则留空）' }
      },
      {
        field: `${prefix}.customUrl`,
        label: '自定义地址',
        component: 'Input',
        componentProps: { placeholder: 'HTTPS 或 SSH 仓库地址' }
      }
    )
  }
  return schemas
}
