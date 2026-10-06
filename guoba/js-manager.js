(() => {
  const q = new URLSearchParams(location.search)
  const context = window.__GUOBA__ || {}
  const apiBase = q.get('__apiBase') || context.apiBase
  const token = q.get('token') || context.token
  const tokenKey = context.tokenKey || 'guoba-access-token'
  const $ = id => document.getElementById(id)
  let files = []
  let directories = []
  let records = []
  let editing = null
  let pending = false
  let editorBusy = false

  const sizeLabel = bytes => bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KiB`
  const dateLabel = value => new Date(value).toLocaleString('zh-CN', { hour12: false })
  const setStatus = (element, message, error = false) => {
    element.textContent = message
    element.classList.toggle('error', error)
  }
  async function request (route, body) {
    if (!apiBase || !token) throw new Error('请从锅巴的“扩展页面 → JS 插件管理”打开此页面，并确认已登录。')
    const response = await fetch(`${apiBase}${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { [tokenKey]: token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
    const data = await response.json()
    if (!response.ok || data.ok === false || data.code !== 0) throw new Error(data.message || '操作失败')
    return data.result
  }

  function cell (row, text = '') {
    const td = document.createElement('td')
    td.textContent = text
    row.append(td)
    return td
  }
  function button (label, action, danger = false) {
    const btn = document.createElement('button')
    btn.textContent = label
    if (danger) btn.className = 'danger'
    btn.disabled = pending
    btn.addEventListener('click', action)
    return btn
  }
  function emptyRow (body, text) {
    const row = document.createElement('tr')
    const td = cell(row, text)
    td.colSpan = 4
    td.className = 'empty'
    body.append(row)
  }
  function renderFiles () {
    $('file-count').textContent = String(files.length)
    const query = $('search').value.toLowerCase()
    const status = $('state-filter').value
    const visible = files.filter(file => file.name.toLowerCase().includes(query) &&
      (!status || file.enabled === (status === 'enabled')))
    const body = $('files-body')
    body.replaceChildren()
    if (!visible.length) emptyRow(body, files.length ? '没有匹配的 JS 插件' : '还没有单文件 JS 插件，点击“上传 JS”或“新建插件”添加。')
    for (const file of visible) {
      const row = document.createElement('tr')
      const label = cell(row)
      const name = document.createElement('div')
      name.className = 'filename'
      name.textContent = file.name
      const directory = document.createElement('span')
      directory.className = 'directory'
      directory.textContent = file.directory
      label.append(name, directory)
      const state = document.createElement('span')
      state.className = `badge${file.enabled ? '' : ' disabled'}`
      state.textContent = file.enabled ? '启用' : '停用'
      cell(row).append(state)
      cell(row, `${sizeLabel(file.size)} · ${dateLabel(file.modifiedAt)}`)
      const actions = document.createElement('div')
      actions.className = 'row-actions'
      actions.append(
        button('编辑', () => openEdit(file)),
        button(file.enabled ? '停用' : '启用', () => operate('/js/toggle', { key: file.key, enabled: !file.enabled, revision: file.revision }, '文件状态已更新。修改后可重启 Yunzai 确保生效。')),
        button('移入回收站', () => {
          if (confirm(`将 ${file.key} 移入回收站？之后可以恢复。`)) {
            operate('/js/trash', { key: file.key, revision: file.revision }, '已移入回收站。修改后可重启 Yunzai 确保生效。')
          }
        }, true)
      )
      cell(row).append(actions)
      body.append(row)
    }
  }

  function renderHistory () {
    $('history-count').textContent = String(records.length)
    const body = $('history-body')
    body.replaceChildren()
    if (!records.length) emptyRow(body, '回收站和修改备份为空')
    for (const record of records) {
      const row = document.createElement('tr')
      cell(row, record.originalKey)
      cell(row, record.kind === 'trash' ? '移入回收站' : '修改前备份')
      cell(row, dateLabel(record.createdAt))
      cell(row).append(button('恢复', () => {
        if (confirm(`恢复 ${record.originalKey}？如果同名文件仍存在，将保留现有文件并提示冲突。`)) {
          operate('/js/restore', { id: record.id }, '已恢复文件。修改后可重启 Yunzai 确保生效。')
        }
      }))
      body.append(row)
    }
  }

  async function refresh () {
    const [list, history] = await Promise.all([request('/js/list'), request('/js/history')])
    files = list.files
    directories = list.directories
    records = history
    $('new-file').disabled = !directories.length || pending
    $('upload').disabled = !directories.length || pending
    renderFiles()
    renderHistory()
    if (list.warnings.length) setStatus($('status'), list.warnings.join('\n'), true)
  }

  async function operate (route, body, message) {
    if (pending) return
    pending = true
    renderFiles()
    renderHistory()
    setStatus($('status'), '正在处理…')
    try {
      await request(route, body)
      await refresh()
      setStatus($('status'), message)
    } catch (error) {
      setStatus($('status'), error.message, true)
    } finally {
      pending = false
      $('new-file').disabled = !directories.length
      $('upload').disabled = !directories.length
      renderFiles()
      renderHistory()
    }
  }

  function openNew (name = 'my-plugin.js', content = '') {
    if (pending || !directories.length) return
    editing = null
    $('editor-title').textContent = '新建 JS 插件'
    $('create-fields').hidden = false
    $('editor-name').disabled = false
    $('editor-enabled').checked = true
    $('editor-name').value = name
    $('editor-code').value = content
    $('editor-path').textContent = ''
    setStatus($('editor-status'), '')
    $('editor').showModal()
    $('editor-name').focus()
  }

  async function openEdit (file) {
    if (pending) return
    try {
      editing = await request(`/js/file?key=${encodeURIComponent(file.key)}`)
      $('editor-title').textContent = `编辑 ${editing.name}`
      $('create-fields').hidden = true
      $('editor-name').disabled = true
      $('editor-path').textContent = editing.key
      $('editor-code').value = editing.content
      setStatus($('editor-status'), '')
      $('editor').showModal()
      $('editor-code').focus()
    } catch (error) {
      setStatus($('status'), error.message, true)
    }
  }

  function closeEditor () {
    if (!editorBusy) $('editor').close()
  }
  async function saveEditor (event) {
    event?.preventDefault()
    if (editorBusy) return
    if (!$('editor-form').reportValidity()) return
    editorBusy = true
    $('editor-save').disabled = true
    setStatus($('editor-status'), '正在检查语法并保存…')
    try {
      const content = $('editor-code').value
      if (editing) await request('/js/save', { key: editing.key, revision: editing.revision, content })
      else await request('/js/create', {
        directory: 'plugins/example', name: $('editor-name').value.trim(),
        content, enabled: $('editor-enabled').checked
      })
      $('editor').close()
      setStatus($('status'), '插件文件已保存。修改后可重启 Yunzai 确保生效。')
      try { await refresh() } catch (error) {
        setStatus($('status'), `文件已保存，但刷新列表失败：${error.message}`, true)
      }
    } catch (error) {
      setStatus($('editor-status'), error.message, true)
    } finally {
      editorBusy = false
      $('editor-save').disabled = false
    }
  }

  function changeTab (history) {
    $('files-panel').hidden = history
    $('history-panel').hidden = !history
    $('files-tab').classList.toggle('selected', !history)
    $('history-tab').classList.toggle('selected', history)
    $('files-tab').setAttribute('aria-selected', String(!history))
    $('history-tab').setAttribute('aria-selected', String(history))
  }
  $('files-tab').addEventListener('click', () => changeTab(false))
  $('history-tab').addEventListener('click', () => changeTab(true))
  $('refresh').addEventListener('click', () => {
    if (pending) return
    setStatus($('status'), '')
    refresh().catch(error => setStatus($('status'), error.message, true))
  })
  $('search').addEventListener('input', renderFiles)
  $('state-filter').addEventListener('change', renderFiles)
  $('new-file').addEventListener('click', () => openNew())
  $('upload').addEventListener('click', () => $('file-upload').click())
  $('file-upload').addEventListener('change', async event => {
    const file = event.target.files[0]
    if (!file) return
    try {
      if (!file.name.endsWith('.js')) throw new Error('请选择 .js 文件')
      if (file.size > 1024 * 1024) throw new Error('单个 JS 插件最大为 1 MiB')
      let source
      try {
        source = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
      } catch { throw new Error('请上传 UTF-8 编码的 JS 文件') }
      openNew(file.name, source)
    } catch (error) { setStatus($('status'), error.message, true) }
    event.target.value = ''
  })
  $('editor-form').addEventListener('submit', saveEditor)
  $('editor-code').addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') saveEditor(event)
    if (event.key === 'Tab') {
      event.preventDefault()
      const textarea = $('editor-code')
      textarea.setRangeText('  ', textarea.selectionStart, textarea.selectionEnd, 'end')
    }
  })
  $('editor-close').addEventListener('click', closeEditor)
  $('editor-cancel').addEventListener('click', closeEditor)
  $('editor').addEventListener('cancel', event => { if (editorBusy) event.preventDefault() })
  refresh().catch(error => setStatus($('status'), error.message, true))
})()
