const process = require('process')
// Handle SIGINT
process.on('SIGINT', () => {
    console.info("SIGINT Received, exiting...")
    process.exit(0)
})

// Handle SIGTERM
process.on('SIGTERM', () => {
    console.info("SIGTERM Received, exiting...")
    process.exit(0)
})

// Handle APP ERRORS
process.on('uncaughtException', (error, origin) => {
    console.log('----- Uncaught exception -----')
    console.log(error)
    console.log('----- Exception origin -----')
    console.log(origin)
})
process.on('unhandledRejection', (reason, promise) => {
    console.log('----- Unhandled Rejection at -----')
    console.log(promise)
    console.log('----- Reason -----')
    console.log(reason)
})

function isObjNull(obj) {
    for (const key in obj) {
        return false;
    };
    return true;
}

const express = require('express');
const http = require('http');
const path = require("path");
const fs = require("fs");
const parser = require('ua-parser-js');
const app = express();
const port = 3001;
const publicRun = process.argv[2];
const nameGenerator = require('./name-generator.js');

app.get('*', (req, res) => {
    if (path.normalize(decodeURI(req.url)) !== decodeURI(req.url)) {
        res.statusCode = 403;
        res.end();
        return;
    }
    const file = path.join(__dirname, 'public', req.url);
    fs.stat(file, function (err, stat) {
        if (!err && stat.isFile()) { //是文件
            res.sendFile(file);
            return;
        }
        if (/^\/[^\/]*\//.test(req.url)) { //如果字符串中包含了两个或以上的斜杆
            req.url = req.url.match(/^\/[^\/]*/)[0]; //截取第一个二个斜杠之间的字符串
            res.redirect(req.url);
        } else {
            res.sendFile(path.join(__dirname, 'public', '/index.html'));
        }
    });
});

const server = http.createServer(app);
(!publicRun == "public") ? server.listen(port) : server.listen(port, '0.0.0.0');
console.log(new Date().toISOString(), ' Snapchat is running on port', port);


class SnapchatServer {

    constructor() {
        const WebSocket = require('ws');
        this._wss = new WebSocket.Server({ server });
        this._wss.on('connection', (socket, request) => this._onConnection(new Peer(socket, request)));
        this._wss.on('headers', (headers, response) => this._onHeaders(headers, response));
        this._rooms = {};
        this._msgs = {};
        this._timer = {};
        this._timeDelMsgs = 259200000;
    }

    _onConnection(peer) {
        this._joinRoom(peer);
        peer.socket.on('message', message => this._onMessage(peer, message));
        this._keepAlive(peer);
        this._sendDispName(peer);
    }

    _onHeaders(headers, response) {
        let match;
        if (response.headers.cookie) match = response.headers.cookie.match(/peerid=([0-9a-zA-Z]{8}-[0-9a-zA-Z]{4}-4[0-9a-zA-Z]{3}-[0-9a-zA-Z]{4}-[0-9a-zA-Z]{12})/);
        if (match) {
            response.peerId = match[1];
        } else {
            response.peerId = Peer.uuid();
        }
        headers.push('Set-Cookie: peerid=' + response.peerId + "; SameSite=Strict; Max-Age=259200"); //; Secure
    }

    _onMessage(sender, message) {
        // Try to parse message 
        try {
            message = JSON.parse(message);
        } catch (e) {
            return; // TODO: handle malformed JSON
        }

        switch (message.type) {
            case 'disconnect':
                this._leaveRoom(sender);
                break;
            case 'pong':
                sender.lastBeat = Date.now();
                break;
            case 'getmsgs':
                this._sendHistoryMsgs(sender, message.time);
                break;
            case 'pub':
                this._pubMsg(sender, message);
                break;
        }

        // relay message to recipient
        if (message.to && this._rooms[sender.room]) {
            const recipientId = message.to; // TODO: sanitize
            const recipient = this._rooms[sender.room][recipientId];
            delete message.to;
            // add sender id
            message.sender = sender.id;
            this._send(recipient, message);
            return;
        }
    }

    _sendDispName(peer) {
        this._send(peer, {
            type: 'display-name',
            dispName: peer.name.displayName,
            peerId: peer.id
        });
    }

    _pubMsg(sender, message) {
        const serverTime = Date.now();
        this._send(sender, {
            type: 'msg-received',
            id: message.time,
            time: serverTime
        });
        message.time = serverTime; //将消息的时间戳替换成服务器时间
        message.sender = sender.id;
        for (const peerId in this._rooms[sender.room]) { //群发消息给其他群成员
            if (sender.id != peerId) this._send(this._rooms[sender.room][peerId], message);
        };
        for (const timeId in this._msgs[sender.room]) { //删除72小时之前的记录
            if (Date.now() - timeId > this._timeDelMsgs) {
                delete this._msgs[sender.room][timeId];
            } else {
                break;
            }
        };
        let delCmd = message.text.match(/^\/del:(.+)/);
        if (delCmd) { //如果为删除指令
            if (delCmd[1] == 'all') {
                for (const timeId in this._msgs[sender.room]) { //删除所有记录
                    if (this._msgs[sender.room][timeId].sender == sender.id) {
                        this._msgs[sender.room][timeId].text = '<span class="chat-room-msg-text-del">[此消息已被删除]</span>';
                    }
                }
            } else {
                for (const timeId in this._msgs[sender.room]) { //删除单条记录
                    if (timeId == delCmd[1] && sender.id == this._msgs[sender.room][timeId].sender) {
                        this._msgs[sender.room][timeId].text = '<span class="chat-room-msg-text-del">[此消息已被删除]</span>';
                        break;
                    }
                }
            }
        } else { //如果不是指令，则添加到对象：_msgs[roomID]，然后添加到数据库
            if (!this._msgs[sender.room]) this._msgs[sender.room] = {};
            this._msgs[sender.room][message.time] = {
                sender: sender.id,
                name: message.name,
                text: message.text
            }
        }
    }

    _sendHistoryMsgs(peer, time) {
        for (const timeId in this._msgs[peer.room]) {
            if (Date.now() - timeId > this._timeDelMsgs) {
                delete this._msgs[peer.room][timeId];
            } else {
                break;
            }
        }
        if (time > 0) {
            let msgs = {};
            for (const timeId in this._msgs[peer.room]) {
                if (timeId > time) {
                    msgs[timeId] = this._msgs[peer.room][timeId];
                }
            }
            this._send(peer, {
                type: 'history-msgs',
                time: Date.now(),
                msgs: msgs
            });
        } else {
            this._send(peer, {
                type: 'history-msgs',
                time: Date.now(),
                msgs: this._msgs[peer.room]
            });
        }
    }

    _joinRoom(peer) {
        // if room doesn't exist, create it
        if (!this._rooms[peer.room]) {
            this._rooms[peer.room] = {};
            //this._msgs[peer.room] = {};
            this._send(peer, {
                type: 'peers',
                peers: []
            });
        } else {
            // notify all other peers
            const otherPeers = [];
            const count = Object.keys(this._rooms[peer.room]).length + 1;
            for (const peerId in this._rooms[peer.room]) {
                if (peerId != peer.id) {
                    otherPeers.push(this._rooms[peer.room][peerId].getInfo());
                    this._send(this._rooms[peer.room][peerId], {
                        type: 'peer-joined',
                        peer: peer.getInfo(),
                        count: count
                    });
                }
            }

            // notify peer about the other peers
            this._send(peer, {
                type: 'peers',
                peers: otherPeers
            });
        }

        // add peer to room
        this._rooms[peer.room][peer.id] = peer;
        if (this._timer[peer.room]) clearTimeout(this._timer[peer.room]); //有成员进群则取消清空消息定时器
    }

    _leaveRoom(peer) {
        if (!this._rooms[peer.room] || !this._rooms[peer.room][peer.id]) return;
        this._cancelKeepAlive(this._rooms[peer.room][peer.id]);

        // delete the peer
        delete this._rooms[peer.room][peer.id];

        peer.socket.terminate();
        //if room is empty, delete the room
        if (isObjNull(this._rooms[peer.room])) { //最后一个群成员退出
            if (isObjNull(this._msgs[peer.room])) { //如果消息记录为空，最后一个成员退出群聊之后直接删除房间和消息对象
                delete this._rooms[peer.room];
                delete this._msgs[peer.room];
            } else { //如果消息记录不为空，最后一个成员退出房间之后设置定时器延时72小时删除房间和消息对象
                this._timer[peer.room] = setTimeout(() => this._delMsgs(peer.room), this._timeDelMsgs);
            }
        } else {
            const count = Object.keys(this._rooms[peer.room]).length;
            // notify all other peers
            for (const otherPeerId in this._rooms[peer.room]) {
                const otherPeer = this._rooms[peer.room][otherPeerId];
                this._send(otherPeer, {
                    type: 'peer-left',
                    peerId: peer.id,
                    peerName: peer.name.displayName,
                    count: count
                });
            }
        }
    }

    _delMsgs(room) {
        delete this._rooms[room];
        delete this._msgs[room];
        delete this._timer[room];
    }

    _send(peer, message) {
        if (!peer) return;
        if (this._wss.readyState !== this._wss.OPEN) return;
        message = JSON.stringify(message);
        peer.socket.send(message, error => '');
    }

    _keepAlive(peer) {
        this._cancelKeepAlive(peer);
        const timeout = 30000;
        if (!peer.lastBeat) {
            peer.lastBeat = Date.now();
        }
        if (Date.now() - peer.lastBeat > 2 * timeout) {
            this._leaveRoom(peer);
            return;
        }
        this._send(peer, { type: 'ping' });
        peer.timerId = setTimeout(() => this._keepAlive(peer), timeout);
    }

    _cancelKeepAlive(peer) {
        if (peer && peer.timerId) {
            clearTimeout(peer.timerId);
        }
    }
}

class Peer {

    constructor(socket, request) {
        this.socket = socket;
        this._setRoom(request);
        this.id = request.peerId;
        this.rtcSupported = request.url.lastIndexOf('/false') < 1;
        this._setName(request);
        this.timerId = 0;
        this.lastBeat = Date.now();
        //console.log(new Date().toISOString(), this.room, this.name.deviceName, 'RTC:', this.rtcSupported);
    }

    _setRoom(request) {
        let match = request.url.match(/@([^\/]+)\//);
        if (match) {
            this.room = decodeURIComponent(match[1]);
        } else {
            this.room = '未命名';
        }
    }

    toString() {
        return `<Peer id=${this.id} ip=${this.room} rtcSupported=${this.rtcSupported}>`;
    }

    _setName(request) {
        let ua = parser(request.headers['user-agent']);
        let deviceName = '';
        if (ua.os && ua.os.name) deviceName = ua.os.name.replace('Mac OS', 'Mac') + ' ';
        if (ua.browser.name) deviceName += ua.browser.name;
        if (!deviceName) deviceName = 'Unknown Device';
        let displayName = '';
        let match = request.url.match(/\/([^@]*)@/);
        if (match) displayName = decodeURIComponent(match[1]);
        if (!displayName) {
            displayName = nameGenerator.getName(this.id);
        }
        this.name = {
            model: ua.device.model,
            os: ua.os.name,
            browser: ua.browser.name,
            type: ua.device.type,
            deviceName,
            displayName
        }
    }

    getInfo() {
        return {
            id: this.id,
            name: this.name,
            rtcSupported: this.rtcSupported
        }
    }

    // return uuid of form xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    static uuid() {
        let uuid = '';
        for (let i = 0; i < 32; i += 1) {
            switch (i) {
                case 8:
                case 20:
                    uuid += '-';
                    uuid += (Math.random() * 16 | 0).toString(16);
                    break;
                case 12:
                    uuid += '-';
                    uuid += '4';
                    break;
                case 16:
                    uuid += '-';
                    uuid += (Math.random() * 4 | 8).toString(16);
                    break;
                default:
                    uuid += (Math.random() * 16 | 0).toString(16);
            }
        }
        return uuid;
    }
}

const snapchatServer = new SnapchatServer();