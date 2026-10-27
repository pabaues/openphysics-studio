const { app, BrowserWindow, Menu, shell } = require('electron')
const path = require('node:path')

const singleInstance = app.requestSingleInstanceLock()
let mainWindow = null

function openExternal(url) {
  if (url.startsWith('https://')) void shell.openExternal(url)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    backgroundColor: '#f4f7fb',
    title: 'OpenPhysics Studio',
    icon: path.join(__dirname, '../build/icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url === mainWindow?.webContents.getURL()) return
    event.preventDefault()
    openExternal(url)
  })
  mainWindow.on('closed', () => { mainWindow = null })
  mainWindow.loadFile(path.join(__dirname, '../dist/index.html')).catch((error) => {
    console.error('Unable to load OpenPhysics Studio:', error)
    mainWindow?.destroy()
  })
}

if (!singleInstance) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
  app.whenReady().then(() => {
    app.setAppUserModelId('org.openphysics.studio')
    Menu.setApplicationMenu(null)
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  }).catch((error) => {
    console.error('Unable to start OpenPhysics Studio:', error)
    app.quit()
  })
  app.on('window-all-closed', () => app.quit())
}
