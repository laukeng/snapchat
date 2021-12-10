var process = require('process')
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

const express = require('express');
const http = require('http');
var path = require("path");
var fs = require("fs");
const app = express();
const port = 3001;
const publicRun = process.argv[2];

app.get('*', (req, res) => {
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
(!publicRun == "public") ? server.listen(port): server.listen(port, '0.0.0.0');
console.log(new Date().toISOString(), ' Snapchat is running on port', port);

const parser = require('ua-parser-js');

class SnapchatServer {

    constructor() {
        const WebSocket = require('ws');
        this._wss = new WebSocket.Server({server});
        this._wss.on('connection', (socket, request) => this._onConnection(new Peer(socket, request)));
        this._wss.on('headers', (headers, response) => this._onHeaders(headers, response));
        this._rooms = {};
        this._msgs = {};
    }

    _onConnection(peer) {
        this._joinRoom(peer);
        peer.socket.on('message', message => this._onMessage(peer, message));
        this._keepAlive(peer);
        this._sendDispName(peer, peer.name.displayName)
    }

    _onHeaders(headers, response) {
        if (response.headers.cookie && response.headers.cookie.indexOf('peerid=') > -1) return;
        response.peerId = Peer.uuid();
        headers.push('Set-Cookie: peerid=' + response.peerId + "; SameSite=Strict; Max-Age=3600; Secure");
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
            case 'pub':
                this._pubMsg(sender, message);
                break;
            case 'rename':
                sender.setDispName(message.name);
                this._sendDispName(sender, );
        }

        // relay message to recipient
        if (message.to && this._rooms[sender.ip]) {
            const recipientId = message.to; // TODO: sanitize
            const recipient = this._rooms[sender.ip][recipientId];
            delete message.to;
            // add sender id
            message.sender = sender.id;
            this._send(recipient, message);
            return;
        }
    }

    _pubMsg(sender, message) {
        this._send(sender, {
            type: 'msg-received',
            id: message.time
        });
        message.time = Date.now(); //将消息的时间戳替换成服务器时间
        for (const peerId in this._rooms[sender.ip]) { //群发消息给其他群成员
            if (sender.id != peerId) this._send(this._rooms[sender.ip][peerId], message)
        };
        this._msgs[sender.ip][message.time] = {
            sender: sender.id,
            name: message.name,
            text: message.text
        };
    }

    _joinRoom(peer) {
        // if room doesn't exist, create it
        if (!this._rooms[peer.ip]) {
            this._rooms[peer.ip] = {};
            this._msgs[peer.ip] = {};
            this._send(peer, {
                type: 'peers',
                peers: []
            });
        } else {
            // notify all other peers
            const otherPeers = [];
            const count = Object.keys(this._rooms[peer.ip]).length;
            for (const peerId in this._rooms[peer.ip]) {
                if (peerId != peer.id) {
                    otherPeers.push(this._rooms[peer.ip][peerId].getInfo());
                    this._send(this._rooms[peer.ip][peerId], {
                        type: 'peer-joined',
                        peer: peer.getInfo(),
                        count: count
                    })
                }
            }

            // notify peer about the other peers
            this._send(peer, {
                type: 'peers',
                peers: otherPeers
            });
        }

        // add peer to room
        this._rooms[peer.ip][peer.id] = peer;
    }

    _leaveRoom(peer) {
        if (!this._rooms[peer.ip] || !this._rooms[peer.ip][peer.id]) return;
        this._cancelKeepAlive(this._rooms[peer.ip][peer.id]);

        // delete the peer
        delete this._rooms[peer.ip][peer.id];

        peer.socket.terminate();
        //if room is empty, delete the room
        if (!Object.keys(this._rooms[peer.ip]).length) {
            delete this._rooms[peer.ip];
            delete this._msgs[peer.ip];
        } else {
            const count = Object.keys(this._rooms[peer.ip]).length;
            // notify all other peers
            for (const otherPeerId in this._rooms[peer.ip]) {
                const otherPeer = this._rooms[peer.ip][otherPeerId];
                this._send(otherPeer, {
                    type: 'peer-left',
                    peerId: peer.id,
                    peerName: peer.name.displayName,
                    count: count
                });
            }
        }
    }

    _send(peer, message) {
        if (!peer) return;
        if (this._wss.readyState !== this._wss.OPEN) return;
        message = JSON.stringify(message);
        peer.socket.send(message, error => '');
    }

    _sendDispName(peer) {
        this._send(peer, {
            type: 'display-name',
            dispName: peer.name.displayName,
            peerId: peer.id
        });
        this._send(peer, {
            type: 'history-msgs',
            msgs: this._msgs[peer.ip]
        });
    }

    _keepAlive(peer) {
        this._cancelKeepAlive(peer);
        var timeout = 30000;
        if (!peer.lastBeat) {
            peer.lastBeat = Date.now();
        }
        if (Date.now() - peer.lastBeat > 2 * timeout) {
            this._leaveRoom(peer);
            return;
        }

        this._send(peer, {type: 'ping'});

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
        this._setIP(request);
        this._setPeerId(request);
        this.rtcSupported = request.url.lastIndexOf('/false') < 1;
        this._setName(request);
        this.timerId = 0;
        this.lastBeat = Date.now();
        console.log(new Date().toISOString(), this.ip, this.name.deviceName, 'RTC:', this.rtcSupported);
    }

    _setIP(request) {
        if (/@[^\/]+\//.test(request.url)) {
            this.ip = decodeURIComponent(request.url.match(/@([^\/]+)\//)[1]);
        } else {
            if (request.headers['x-forwarded-for']) {
                //console.log('x-forwarded-for:',request.headers['x-forwarded-for']);
                var ip = /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/;
                //this.ip = request.headers['x-forwarded-for'].split(/\s*,\s*/)[0];
                this.ip = request.headers['x-forwarded-for'].match(ip)[0];
            } else {
                //console.log('connection.remoteAddress:',request.connection.remoteAddress);
                this.ip = request.connection.remoteAddress;
            }
            // IPv4 and IPv6 use different values to refer to localhost
            if (this.ip == '::1' || this.ip == '::ffff:127.0.0.1') {
                this.ip = '127.0.0.1';
            }
        }
        if (/^((192\.168\.)|fe80|(10\.)|(172\.16\.))/.test(this.ip)) this.ip = "local";
    }

    _setPeerId(request) {
        if (request.peerId) {
            this.id = request.peerId;
        } else {
            this.id = request.headers.cookie.match(/peerid=([0-9a-zA-Z]{8}-[0-9a-zA-Z]{4}-4[0-9a-zA-Z]{3}-[0-9a-zA-Z]{4}-[0-9a-zA-Z]{12})/)[1];
        }
    }

    toString() {
        return `<Peer id=${this.id} ip=${this.ip} rtcSupported=${this.rtcSupported}>`
    }

    _setName(request) {
        let ua = parser(request.headers['user-agent']);
        let deviceName = '';
        if (ua.os && ua.os.name) deviceName = ua.os.name.replace('Mac OS', 'Mac') + ' ';
        if (ua.browser.name) deviceName += ua.browser.name;
        if (!deviceName) deviceName = 'Unknown Device';
        var displayName = '';
        if (/^\/[^@]*@/.test(request.url)) {
            displayName = decodeURIComponent(request.url.match(/\/([^@]*)@/)[1]);
        }
        this.name = {
            model: ua.device.model,
            os: ua.os.name,
            browser: ua.browser.name,
            type: ua.device.type,
            deviceName,
            displayName
        };
        this.setDispName(displayName);
    }

    setDispName(newName){
        if (newName == '') {
            var nameGenerator = require('./nameGenerator.js');
            newName = nameGenerator.getName(this.id);
        }
        this.name.displayName = newName;
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
        let uuid = '',
            ii;
        for (ii = 0; ii < 32; ii += 1) {
            switch (ii) {
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
    };
}

new SnapchatServer();