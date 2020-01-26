exports.electronStore = function () {
    const Store = require('electron-store');
    const schema = {
        serial: {
            baudRate: {
                type: 'number',
                maximum: 115200,
                minimum: 9600,
                default: 115200
            },
        },
        mysql: {
            host: {
                type: 'string',
                default: 'localhost'
            },
            port: {
                type: 'number',
                default: 3306
            },
            user: {
                type: 'string',
                default: 'root'
            },
            password: {
                type: 'string',
                default: ''
            },
            database: {
                type: 'string',
                default: 'iot'
            },
            table: {
                type: 'string',
                default: 'data'
            }
        }
    };
    const store = new Store({schema});
    store.set({
        serial: {
            baudRate: 115200
        },
        mysql: {
            host: 'localhost',
            port: 3306,
            user: 'root',
            password: 'root',
            database: 'iot',
            table: 'data'
        }
    });
    console.log(store.get('mysql.port'));
};