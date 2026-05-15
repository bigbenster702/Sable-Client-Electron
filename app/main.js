import { app, BrowserWindow, session, Notification, ipcMain, Tray, Menu, shell, desktopCapturer, nativeImage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

let mainWindow;
let tray = null;
app.isQuitting = false;

const grantedPermissions = [
    'media',
    'notifications',
    'display-capture',
    'clipboard-write'
]

const gotTheLock = app.requestSingleInstanceLock();

function getAsset(...segments) {
    return app.isPackaged
        ? path.join(process.resourcesPath, 'app', ...segments)
        : path.join(__dirname, ...segments);
}

function getBoundsFile() {
    return path.join(app.getPath('userData'), 'window-bounds.json');
};

function loadWindowBounds() {
    try {
        const file = getBoundsFile();
        if (fs.existsSync(file)) {
            const raw = fs.readFileSync(file, 'utf8');

            return JSON.parse(raw);
        }
    } catch (e) {
        console.error('Failed to load window bounds:', e);
    }
    return null;
};

function saveWindowBounds(bounds) {
    try {
        fs.writeFileSync(getBoundsFile(), JSON.stringify(bounds));
    } catch (e) {
        console.error('Failed to save window bounds:', e);
    }
};

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });

    function createWindow() {
        const savedBounds = loadWindowBounds();
        mainWindow = new BrowserWindow({
            width: savedBounds && savedBounds.width ? savedBounds.width : 1200,
            height: savedBounds && savedBounds.height ? savedBounds.height : 800,
            title: "Sable Client",
            icon: getAsset('icons', 'favicon.png'),
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: getAsset('preload.js')
            }
        });

        mainWindow.removeMenu();

        mainWindow.webContents.on('did-finish-load', () => {
            mainWindow.webContents.executeJavaScript('localStorage.setItem("notificationsEnabled", "true");');
        });

        mainWindow.webContents.setWindowOpenHandler(({ url }) => {
            if (!url.includes('sable.moe')) {
                shell.openExternal(url);
                
                return { action: 'deny' };
            }

            return { action: 'allow' };
        });

        mainWindow.webContents.on('will-navigate', (event, url) => {
            if (!url.includes('sable.moe')) {
                event.preventDefault();
                shell.openExternal(url);
            }
        });

        session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
            return grantedPermissions.includes(permission);
        });

        session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
            const url = webContents.getURL();

            callback(url.includes('sable.moe') && grantedPermissions.includes(permission));
        });

        // TODO: window picker
        session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
            desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
                if (sources && sources.length > 0) {
                    callback({ video: sources[0], audio: 'loopback' });
                }
            }).catch(err => {
                console.error('Error getting desktop sources:', err);
            });
        });

        mainWindow.loadURL('https://app.sable.moe');

        mainWindow.on('close', (event) => {
            if (!app.isQuitting) {
                try {
                    const [w, h] = mainWindow.getSize();
                    saveWindowBounds({ width: w, height: h });
                } catch (e) {
                    console.error('Error saving bounds on close:', e);
                }

                event.preventDefault();
                mainWindow.hide();
            }
            
            return false;
        });

        mainWindow.on('resize', () => {
            try {
                const [w, h] = mainWindow.getSize();
                saveWindowBounds({ width: w, height: h });
            } catch (e) {
                console.error('Error saving bounds on resize:', e);
            }
        });
    }

    function createTray() {
        try {
            tray = new Tray(getAsset('icons', 'tray-icon.png'));

            const contextMenu = Menu.buildFromTemplate([
                {
                    label: 'Open Sable Client', click: () => {
                        mainWindow.show();
                        mainWindow.focus();
                    }
                },
                { type: 'separator' },
                {
                    label: 'Quit', click: () => {
                        app.isQuitting = true;
                        app.quit();
                    }
                }
            ]);

            tray.setToolTip('Sable Client');
            tray.setContextMenu(contextMenu);

            tray.on('click', () => {
                mainWindow.show();
                mainWindow.focus();
            });
        } catch (error) {
            console.error("FAILED to create tray:", error);
        }
    }

    ipcMain.on('notify', (event, { title, body }) => {
        const toast = new Notification({
            title: title,
            body: body,
            icon: getAsset('icons', 'favicon.png'),
            silent: false
        });

        toast.on('click', () => {
            if (mainWindow) {
                if (mainWindow.isMinimized()) mainWindow.restore();
                mainWindow.show();
                mainWindow.focus();
            }
        });

        toast.show();
    });

    app.whenReady().then(() => {
        createWindow();
        createTray();
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });

    app.on('activate', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}