import {
  getGuobaConfigData,
  getGuobaSchemas,
  saveGuobaData
} from './lib/repo-manager.js'

export function supportGuoba () {
  return {
    pluginInfo: {
      name: 'yunzai-repo-manager',
      title: 'Yunzai 插件仓库管理',
      description: '配置 GitHub / Gitee / GitCode 凭据，切换每个插件的 Git 仓库地址',
      author: '@yuxiri',
      authorLink: 'https://github.com/yuxiri',
      link: 'https://github.com/yuxiri/yunzai-repo-manager',
      isV3: true,
      isV2: false,
      showInMenu: true,
      icon: 'mdi:source-repository'
    },
    configInfo: {
      schemas: getGuobaSchemas(),
      getConfigData: getGuobaConfigData,
      setConfigData (data, { Result }) {
        try {
          return saveGuobaData(data, Result)
        } catch (error) {
          return Result.error(error.message || String(error))
        }
      }
    }
  }
}
