import { jsManager } from '../lib/js-manager.js'

export function init (ctx) {
  ctx.registerPage({
    id: 'yunzai-js-manager',
    title: 'JS 插件管理',
    icon: 'mdi:language-javascript',
    src: 'js-manager.html',
    style: 'js-manager.css',
    script: 'js-manager.js',
    priority: 40
  })

  const register = (method, route, action, message = '操作成功') => {
    ctx.registerApi(method, route, (req, res) => {
      try {
        res.json({ ok: true, code: 0, result: action(req), message })
      } catch (error) {
        res.status(error.status || 400).json({ ok: false, code: -1, result: null, message: error.message || String(error) })
      }
    })
  }

  register('get', '/js/list', () => jsManager.list())
  register('get', '/js/file', req => jsManager.get(req.query.key))
  register('post', '/js/create', req => jsManager.create(req.body), '已创建插件文件')
  register('post', '/js/save', req => jsManager.save(req.body), '已保存，修改前的内容已备份')
  register('post', '/js/toggle', req => jsManager.toggle(req.body), '已更新插件文件的启停状态')
  register('post', '/js/trash', req => jsManager.trash(req.body), '已移入回收站')
  register('get', '/js/history', () => jsManager.history())
  register('post', '/js/restore', req => jsManager.restore(req.body), '已恢复插件文件')
}
