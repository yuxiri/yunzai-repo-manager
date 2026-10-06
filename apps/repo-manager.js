import plugin from '../../../lib/plugins/plugin.js'
import {
  findRepository,
  formatRepositoryList,
  loadConfig,
  switchRepository
} from '../lib/repo-manager.js'

export class RepoManager extends plugin {
  constructor () {
    super({
      name: '插件仓库管理',
      dsc: '查看并切换已安装插件的 GitHub / Gitee / GitCode 仓库地址',
      event: 'message',
      priority: 500,
      rule: [
        { reg: '^#仓库列表$', fnc: 'listRepos' },
        { reg: '^#仓库切换\\s+(.+)\\s+(github|gitee|gitcode|custom)$', fnc: 'switchRepo' }
      ]
    })
  }

  async listRepos () {
    if (!this.e.isMaster) return false
    await this.reply(formatRepositoryList())
    return true
  }

  async switchRepo () {
    if (!this.e.isMaster) return false
    const match = String(this.e.msg || '').match(/^#仓库切换\s+(.+)\s+(github|gitee|gitcode|custom)$/)
    if (!match) return false
    try {
      const repo = findRepository(match[1].trim())
      const target = switchRepository(repo, match[2].toLowerCase(), loadConfig())
      await this.reply(`已将 ${repo.key} 的 origin 切换为：\n${target}`)
    } catch (error) {
      await this.reply(`切换失败：${error.message}`)
    }
    return true
  }
}
