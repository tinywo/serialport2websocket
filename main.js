const { app, BrowserWindow, Menu, Tray, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');
const { WebSocketServer } = require('ws');
const { SerialPort } = require('serialport');

const config = require('./util/config');

config.electronStore();

const trayIconPath = path.join(__dirname, 'static/img/tray.ico');

let activePort = [];
let plug = '';
let host = '';
let appTray = null;
let win = null;
let newWin = null;
let port = null;
let wss = null;
let serialEventEmitter = null;

async function refreshActivePorts() {
    try {
        const ports = await SerialPort.list();
        activePort = ports.map((item) => item.path);
        plug = activePort[0] || '';
    } catch (error) {
        console.error('[SerialPort:list]', error.message);
        activePort = [];
        plug = '';
    }

    return activePort;
}

function getIPAddress() {
    const interfaces = os.networkInterfaces();

    for (const iface of Object.values(interfaces)) {
        if (!iface) {
            continue;
        }

        for (const alias of iface) {
            const isIPv4 = alias.family === 'IPv4' || alias.family === 4;

            if (isIPv4 && alias.address !== '127.0.0.1' && !alias.internal) {
                host = alias.address;
                return host;
            }
        }
    }

    host = '127.0.0.1';
    return host;
}

function buildTray() {
    if (appTray) {
        return;
    }

    const trayMenuTemplate = [
        {
            label: '设置',
            click() {
                openSetting();
            }
        },
        {
            label: '帮助',
            click() {}
        },
        {
            label: '关于',
            click() {}
        },
        {
            label: '退出',
            click() {
                app.quit();
            }
        }
    ];

    appTray = new Tray(trayIconPath);
    appTray.setToolTip('串口转WS中间件');
    appTray.setContextMenu(Menu.buildFromTemplate(trayMenuTemplate));
    appTray.on('click', () => {
        if (win) {
            win.show();
            win.focus();
        }
    });
}

function getRendererPreferences() {
    return {
        nodeIntegration: true,
        contextIsolation: false
    };
}

function openSetting() {
    if (newWin) {
        newWin.show();
        newWin.focus();
        return;
    }

    newWin = new BrowserWindow({
        width: 360,
        height: 634,
        parent: win || undefined,
        webPreferences: getRendererPreferences()
    });

    newWin.loadFile('setting.html');
    newWin.on('closed', () => {
        newWin = null;
    });
}

function createWindow() {
    Menu.setApplicationMenu(null);

    win = new BrowserWindow({
        width: 360,
        height: 304,
        resizable: false,
        show: false,
        webPreferences: getRendererPreferences()
    });

    win.loadFile('index.html');
    buildTray();

    win.on('closed', () => {
        win = null;
    });

    win.once('ready-to-show', () => {
        if (win) {
            win.show();
        }
    });
}

function normalizeSocketPayload(text) {
    const rawText = String(text);

    try {
        return JSON.stringify(JSON.parse(rawText));
    } catch (error) {
        return rawText;
    }
}

function closeWebSocketServer() {
    if (!wss) {
        return;
    }

    for (const client of wss.clients) {
        client.close();
    }

    wss.close();
    wss = null;
}

function closeSerialPort() {
    return new Promise((resolve) => {
        if (!port || !port.isOpen) {
            port = null;
            resolve();
            return;
        }

        port.close((error) => {
            if (error) {
                console.error('[SerialPort:close]', error.message);
            }

            port = null;
            resolve();
        });
    });
}

async function stopService() {
    serialEventEmitter = null;
    closeWebSocketServer();
    await closeSerialPort();
}

async function startService(sender, requestedPort) {
    await stopService();

    plug = requestedPort || plug;
    host = getIPAddress();

    if (!plug) {
        sender.send('serviceStatus', '未连接设备');
        return;
    }

    serialEventEmitter = new EventEmitter();

    try {
        wss = new WebSocketServer({
            port: 8000,
            host
        });
    } catch (error) {
        sender.send('serviceStatus', `WebSocket 启动失败: ${error.message}`);
        return;
    }

    wss.on('connection', (ws) => {
        ws.send('连接成功!');

        const handlePostMsg = (msg) => {
            if (ws.readyState === ws.OPEN) {
                ws.send(msg);
            }
        };

        serialEventEmitter.on('postMsg', handlePostMsg);
        ws.on('close', () => {
            if (serialEventEmitter) {
                serialEventEmitter.off('postMsg', handlePostMsg);
            }
        });
    });

    wss.on('error', (error) => {
        console.error('[WebSocketServer]', error.message);
        sender.send('serviceStatus', `WebSocket 异常: ${error.message}`);
    });

    try {
        port = new SerialPort({
            path: plug,
            baudRate: 115200
        });
    } catch (error) {
        closeWebSocketServer();
        sender.send('serviceStatus', `串口启动失败: ${error.message}`);
        return;
    }

    port.on('open', () => {
        sender.send('serviceStatus', `已启动串口: ${plug}`);
    });

    port.on('error', (error) => {
        console.error('[SerialPort]', error.message);
        sender.send('serviceStatus', `串口异常: ${error.message}`);
    });

    port.on('data', (data) => {
        const serialText = data.toString();
        const socketPayload = normalizeSocketPayload(serialText);

        sender.send('showSerialData', serialText);
        sender.send('showSocketData', socketPayload);

        if (serialEventEmitter) {
            serialEventEmitter.emit('postMsg', socketPayload);
        }
    });
}

app.whenReady().then(async () => {
    getIPAddress();
    await refreshActivePorts();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    stopService().catch((error) => {
        console.error('[before-quit]', error.message);
    });
});

ipcMain.on('getIpAddress', (event) => {
    event.sender.send('backIpAddress', getIPAddress());
});

ipcMain.on('getActivePorts', async (event) => {
    const ports = await refreshActivePorts();
    event.sender.send('backActivePorts', ports);
});

ipcMain.on('startService', async (event, args) => {
    await startService(event.sender, args);
});

ipcMain.on('stopService', async (event) => {
    await stopService();
    event.sender.send('serviceStatus', '已关闭串口');
});
