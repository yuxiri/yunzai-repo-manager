export const PLATFORMS = [
  { id: 'github', label: 'GitHub', hosts: ['github.com'] },
  { id: 'gitee', label: 'Gitee', hosts: ['gitee.com'] },
  {
    id: 'gitcode',
    label: 'GitCode',
    hosts: ['gitcode.com', 'hub.gitcode.com'],
    sshDomain: 'gitcode.com'
  }
]

export const PLATFORM_IDS = PLATFORMS.map(platform => platform.id)
export const REPOSITORY_PROVIDERS = [...PLATFORM_IDS, 'custom']
export const REPOSITORY_URL_FIELDS = [...PLATFORM_IDS.map(id => `${id}Url`), 'customUrl']

export function platformForHost (host, ssh = false) {
  const normalized = String(host || '').toLowerCase()
  return PLATFORMS.find(platform => platform.hosts.includes(normalized) || (
    ssh && platform.sshDomain && normalized.endsWith(`.${platform.sshDomain}`)
  ))
}
