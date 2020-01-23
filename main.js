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
const mysql = require('mysql');
const connection = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "root",
    database: "iot"
});
//const add_data={temp:11,hum:22,created:"2022-1-23 16:43:00"};

var addSql = 'INSERT INTO data(Id,temp,hum,created)VALUES(0,?,?,?)';
var addSqlParams = [11, 22, '2022-1-23 16:43:00'];
connection.query(addSql, addSqlParams, function (err, result) {
    if (err) {
        console.log('[INSERT ERROR] -', err.message);
        return;
    }
});
connection.end();
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
