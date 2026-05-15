import { contextBridge, ipcRenderer, clipboard } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    sendNotification: (title, body) => ipcRenderer.send('notify', { title, body }),
    writeClipboard: (text) => {
        try {
            clipboard.writeText(String(text ?? ''));
            
            return true;
        } catch (e) {
            return false;
        }
    }
});

window.addEventListener('DOMContentLoaded', () => {
    function CustomNotification(title, options) {
        ipcRenderer.send('notify', { 
            title: title, 
            body: options.body || '' 
        });

        return {
            onclick: null,
            close: () => {}
        };
    }

    CustomNotification.permission = 'granted';
    CustomNotification.requestPermission = (cb) => {
        if (cb) cb('granted');
        return Promise.resolve('granted');
    };

    window.Notification = CustomNotification;
});