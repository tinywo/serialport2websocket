const electron = require('electron');
const {app, BrowserWindow, Menu} = electron;
const path = require('path');
const url = require('url');
const os = require('os');
const WebSocket = require('ws');
const SerialPort = require('serialport');   //定义SerialPort类
const ipcMain = electron.ipcMain;   //  主进程
let activePort = [];
let plug = '';
let host = '';
const Tray = electron.Tray;
let appTray = null;
const config = require('./util/config');
config.electronStore();
const mysql = require('mysql');
const conn = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "root",
    database: "iot"
});
const addSql = 'INSERT INTO data(Id,temp,hum,created)VALUES(0,?,?,?)';
const addSqlParams = [11, 22, '2022-1-23 16:43:00'];
conn.query(addSql, addSqlParams, (err, result) => {
    if (err) return console.log('[ErrorInfo]: ', err.message);
});
//  遍历串口端口
SerialPort.list().then(
    ports => ports.forEach(activePorts),
    err => console.error(err)
);

//  可用的端口
function activePorts(item, index) {
    activePort[index] = item.path;
    plug = activePort[0];
}

//  获取本机IP
function getIPAddress() {
    let interfaces = os.networkInterfaces();
    for (let devName in interfaces) {
        let iface = interfaces[devName];
        for (let i = 0; i < iface.length; i++) {
            let alias = iface[i];
            if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                var ip = alias.address;
            }
        }
    }
    host = ip;
    return ip;
}

let win;

function createWindow() {
    //  隐藏菜单
    Menu.setApplicationMenu(null);
    //  创建浏览器窗口
    win = new BrowserWindow({
        width: 360,
        height: 304,
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
            show: false,
        }
    });
    // and load the index.html of the app.
    win.loadURL(url.format({
        pathname: path.join(__dirname, 'index.html'),
        protocol: 'file:',
        slashes: true
    }));
    var trayMenuTemplate = [
        {
            label: '设置',
            click: function () {
            } //打开相应页面
        },
        {
            label: '帮助',
            click: function () {
            }
        },
        {
            label: '关于',
            click: function () {
            }
        },
        {
            label: '退出',
            click: function () {
                app.quit();
                app.quit();//因为程序设定关闭为最小化，所以调用两次关闭，防止最大化时一次不能关闭的情况
            }
        }
    ];
    //系统托盘图标目录
    //trayIcon = path.join(__dirname, 'static');//app是选取的目录

    //appTray = new Tray(path.join(trayIcon, 'favicon.ico'));//app.ico是app目录下的ico文件
    appTray = new Tray(path.join('./static/img/favicon.ico'));//app.ico是app目录下的ico文件

    //图标的上下文菜单
    const contextMenu = Menu.buildFromTemplate(trayMenuTemplate);

    //设置此托盘图标的悬停提示内容
    appTray.setToolTip('我的托盘图标');

    //设置此图标的上下文菜单
    appTray.setContextMenu(contextMenu);
    //单击右下角小图标显示应用
    appTray.on('click', function () {
        win.show();
    });

    //  打开开发者工具
    //win.webContents.openDevTools();
    // Emitted when the window is closed.
    win.on('closed', () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        win = null;
    });
    win.once('ready-to-show', function () {
        win.show();
        win.webContents.send('main-process-messages', 'main-process-messages show')
    });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow, () => {
    tray = new Tray(path.join())
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        win = null;
        app.quit()
    }
});

app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null) {
        createWindow()
    }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
ipcMain.on('getIpAddress', function (event) {
    event.sender.send('backIpAddress', getIPAddress());
});

ipcMain.on('getActivePorts', function (event) {
    event.sender.send('backActivePorts', activePort)
});

ipcMain.on('startService', function (event, args) {
        plug = args;
        //  引入 events 模块
        var events = require('events');
        //  创建 eventEmitter 对象
        SPeventEmitter = new events.EventEmitter();
        var WebSocketServer = WebSocket.Server;
        wss = new WebSocketServer({
            port: 8000,
            host: host
        });
        if (plug === '') {
            event.sender.send('serviceStatus', '未连接设备');
        } else {
            event.sender.send('serviceStatus', '已启动串口');
            port = new SerialPort(plug, {
                baudRate: 115200,
            });
            wss.on('connection', function (ws) {
                ws.send("连接成功!");
                SPeventEmitter.on('postMsg', function (msg) {
                    ws.send(msg);
                });
            });
            port.on('open', function () {
                port.on('data', function (data) {
                    var txt = data.toString();
                    event.sender.send('showSerialData', txt);
                    var wstxt = JSON.parse(txt);
                    SPeventEmitter.emit('postMsg', wstxt);
                    event.sender.send('showSocketData', wstxt);
                });
            });
        }
    }
);
ipcMain.on('stopService', function (event, args) {
    if (port.isOpen) {
        port.close(function (err) {
            if (err) throw err;
            else
                event.sender.send('serviceStatus', '已关闭串口');
        });
    }
    wss.close();
});

