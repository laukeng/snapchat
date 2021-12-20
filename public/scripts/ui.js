const $ = query => document.getElementById(query);
const $$ = query => document.body.querySelector(query);
const isURL = text => /^((https?:\/\/|www)[^\s]+)/g.test(text.toLowerCase());
window.isDownloadSupported = (typeof document.createElement('a').download !== 'undefined');
window.isProductionEnvironment = !window.location.host.startsWith('localhost');
window.iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
let server = {};
let roomName = '';
let nickName = '';
let myId = '';

Date.prototype.format = function (fmt) {
    let o = {
        "M+": this.getMonth() + 1, // 月份
        "d+": this.getDate(), // 日
        "h+": this.getHours(), // 小时
        "m+": this.getMinutes(), // 分
        "s+": this.getSeconds(), // 秒
        "q+": Math.floor((this.getMonth() + 3) / 3), // 季度
        "S": this.getMilliseconds() // 毫秒
    };
    if (/(y+)/.test(fmt)) {
        fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
    };
    for (let k in o) {
        if (new RegExp("(" + k + ")").test(fmt)) fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
    };
    return fmt;
};

HTMLElement.prototype.appendHTML = function (html) {
    let divTemp = document.createElement("div"),
        nodes = null,
        fragment = document.createDocumentFragment();
    divTemp.innerHTML = html;
    nodes = divTemp.childNodes;
    for (let i = 0, length = nodes.length; i < length; i += 1) {
        fragment.appendChild(nodes[i].cloneNode(true));
    }
    this.appendChild(fragment);
    nodes = null;
    fragment = null;
};

Events.on('load', e => {
    const peersUI = new PeersUI();
    const joinRoomDialog = new JoinRoomDialog();
    const receiveDialog = new ReceiveDialog();
    const sendTextDialog = new SendTextDialog();
    const receiveTextDialog = new ReceiveTextDialog();
    const networkStatusUI = new NetworkStatusUI();
    const webShareTargetUI = new WebShareTargetUI();
    const toast = new Toast();
    if (joinRoomDialog.$textRoom.value && joinRoomDialog.$textName.value) {
        roomName = joinRoomDialog.$textRoom.value;
        nickName = joinRoomDialog.$textName.value;
        server = new ServerConnection(roomName, nickName);
    } else {
        joinRoomDialog.show();
    };
    $('pub-msg-button').addEventListener('click', pubMsg);
    $('pub-msg-text').onkeydown = function (ev) {
        let oEvent = ev || event;
        if (oEvent.keyCode == 13 && oEvent.ctrlKey) {
            pubMsg();
        }
    };
    document.documentElement.style.setProperty('--display-trash', 'none');
    $('delete').addEventListener('click', function () {
        if (getComputedStyle(document.documentElement).getPropertyValue('--display-trash') == 'none') {
            document.documentElement.style.setProperty('--display-trash', 'block');
        } else {
            document.documentElement.style.setProperty('--display-trash', 'none');
        }
    });
});

// set display name
Events.on('display-name', e => {
    const msg = e.detail;
    nickName = decodeURIComponent(msg.dispName);
    myId = msg.peerId;
    $('nameInput').value = nickName;
    Events.fire('notify-user', nickName + ' 欢迎您加入本群');
});

Events.on('history-msgs', e => {
    const msgs = e.detail.msgs;
    let msgHtml;
    for (let time in msgs) {
        let msg = msgs[time];
        let divClass = msg.sender == myId ? 'chat-room-me ' : 'chat-room-other ';
        divClass += msg.sender;
        let delBtnHtml = '';
        if (msg.sender == myId) {
            delBtnHtml = `
                <div class="chat-room-msg-btn">
                    <a class="icon-button" title="删除消息" onclick="delMsg(${time})">
                        <svg class="icon"><use xlink:href="#icon-trash"></use></svg>
                    </a>
                </div>`;
        };
        msgHtml = `
            <div id="${time}" class="${divClass}">${delBtnHtml}
                <div class="chat-room-msg">
                    <div class="chat-room-msg-time">${new Date(parseInt(time)).format("yyyy-MM-dd hh:mm:ss")}</div>
                    <span class="chat-room-msg-name">${msg.name} : </span>
                    <span class="chat-room-msg-text">${replaceURLWithHTMLLinks(msg.text)}</span>
                </div>
            </div>`;
        $('chat-room-content').appendHTML(msgHtml);
    };
    $('chat-room-box').scrollTop = $('chat-room-box').scrollHeight;
});

Events.on('peers', e => {
    const msg = e.detail;
    $('room-title').innerText = roomName + '(' + (msg.length + 1) + ')';
});

Events.on('peer-joined', e => {
    const msg = e.detail;
    $('room-title').innerText = roomName + '(' + msg.count + ')';
    Events.fire('notify-user', decodeURIComponent(msg.peer.name.displayName) + ' 加入了群聊');
});

Events.on('peer-left', e => {
    const msg = e.detail;
    $('room-title').innerText = roomName + '(' + msg.count + ')';
    Events.fire('notify-user', decodeURIComponent(msg.peerName) + ' 退出了群聊');
});

Events.on('msg-received', e => {
    const msg = e.detail;
    if ($(msg.id)) {
        $(msg.id).querySelector('.chat-room-msg').style.background = 'var(--msg-bg-color-me)';
        $(msg.id).querySelector('.icon-button').setAttribute('onclick', 'delMsg(' + msg.time + ')');
        $(msg.id).id = msg.time;
    };
});

Events.on('show-msg', e => { //当接收到服务器群发的一条消息
    const msg = e.detail;
    let delCmd = msg.text.match(/^\/del:(.+)/);
    if (delCmd) { //如果接收到的是删除指令
        if (delCmd[1] == 'all') {
            delMsgs(msg.sender);
        } else {
            if ($(delCmd[1])) $(delCmd[1]).querySelector('.chat-room-msg-text').innerHTML = '<span class="chat-room-msg-text-del">[此消息已被删除]</span>';
        };
        return;
    };
    let msgHtml = `
        <div id="${msg.time}" class="chat-room-other ${msg.sender}">
            <div class="chat-room-msg">
                <div class="chat-room-msg-time">${new Date(parseInt(msg.time)).format("yyyy-MM-dd hh:mm:ss")}</div>
                <span class="chat-room-msg-name">${msg.name} : </span>
                <span class="chat-room-msg-text">${replaceURLWithHTMLLinks(msg.text)}</span>
            </div>
        </div>`;
    $('chat-room-content').appendHTML(msgHtml);
    $('chat-room-box').scrollTop = $('chat-room-box').scrollHeight;
});

function replaceURLWithHTMLLinks(text) {
    let exp = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/i;
    return text.replace(exp, '<a target="_blank" href="$1">$1</a>');
}

function delMsgs(sender) {
    let els = document.getElementsByClassName(sender);
    for (let i = 0; i < els.length; i++) {
        els[i].querySelector('.chat-room-msg-text').innerHTML = '<span class="chat-room-msg-text-del">[此消息已被删除]</span>';
    }
}

function delMsg(msgId) {
    if (server) {
        let timeStamp = Date.now();
        let success = server.send({
            type: 'pub',
            name: nickName,
            time: timeStamp,
            text: '/del:' + msgId
        });
        if (success) {
            if ($(msgId)) $(msgId).querySelector('.chat-room-msg-text').innerHTML = '<span class="chat-room-msg-text-del">[此消息已被删除]</span>';
        } else {
            Events.fire('notify-user', '无法删除消息');
        }
    } else {
        Events.fire('notify-user', '未连接到服务器');
    }
}

function showMyMsg(text, id) { //显示自己发出的消息
    let msgHtml = `
        <div id="${id}" class="chat-room-me ${myId}">
            <div class="chat-room-msg-btn">
                <a class="icon-button" title="删除消息">
                    <svg class="icon"><use xlink:href="#icon-trash"></use></svg>
                </a>
            </div>
            <div class="chat-room-msg">
                <div class="chat-room-msg-time">${new Date(parseInt(id)).format("yyyy-MM-dd hh:mm:ss")}</div>
                <span class="chat-room-msg-name">${nickName} : </span>
                <span class="chat-room-msg-text">${replaceURLWithHTMLLinks(text)}</span>
            </div>
        </div>`;
    $('chat-room-content').appendHTML(msgHtml);
    $('chat-room-box').scrollTop = $('chat-room-box').scrollHeight;
    $(id).querySelector('.chat-room-msg').style.background = '#ee9911';
}

function pubMsg() {
    if ($('pub-msg-text').innerText) {
        if (server) {
            let timeStamp = Date.now();
            let success = server.send({
                type: 'pub',
                name: nickName,
                time: timeStamp,
                text: $('pub-msg-text').innerText
            });
            if (success) {
                if ($('pub-msg-text').innerText == '/del:all') {
                    delMsgs(myId);
                } else {
                    showMyMsg($('pub-msg-text').innerText, timeStamp);
                }
                $('pub-msg-text').innerText = '';
            } else {
                Events.fire('notify-user', '无法发送消息');
            }
        } else {
            Events.fire('notify-user', '未连接到服务器');
        }
    }
}


class PeersUI {

    constructor() {
        Events.on('peer-opened', e => this._onPeerJoined(e.detail));
        Events.on('peer-closed', e => this._onPeerLeft(e.detail));
        Events.on('peer-left', e => this._onPeerLeft(e.detail.peerId));
        Events.on('file-progress', e => this._onFileProgress(e.detail));
        Events.on('paste', e => this._onPaste(e));
    }

    _onPeerJoined(peer) {
        if ($(peer.id)) return; // peer already exists
        const peerUI = new PeerUI(peer);
        $$('x-peers').appendChild(peerUI.$el);
        //setTimeout(e => window.animateBackground(false), 1750); // Stop animation
    }

    _onPeerLeft(peerId) {
        const $peer = $(peerId);
        if (!$peer) return;
        $peer.remove();
    }

    _onFileProgress(progress) {
        const peerId = progress.sender || progress.recipient;
        const $peer = $(peerId);
        if (!$peer) return;
        $peer.ui.setProgress(progress.progress);
    }

    _clearPeers() {
        const $peers = $$('x-peers').innerHTML = '';
    }

    _onPaste(e) {
        const files = e.clipboardData.files || e.clipboardData.items
            .filter(i => i.type.indexOf('image') > -1)
            .map(i => i.getAsFile());
        const peers = document.querySelectorAll('x-peer');
        // send the pasted image content to the only peer if there is one
        // otherwise, select the peer somehow by notifying the client that
        // "image data has been pasted, click the client to which to send it"
        // not implemented
        if (files.length > 0 && peers.length === 1) {
            Events.fire('files-selected', {
                files: files,
                to: $$('x-peer').id
            });
        }
    }
}


class PeerUI {

    html() {
        return `
            <label class="column center" title="点击图标发送文件或者右键点击发送文字">
                <input type="file" multiple>
                <x-icon shadow="1">
                    <svg class="icon"><use xlink:href="#"/></svg>
                </x-icon>
                <div class="progress">
                  <div class="circle"></div>
                  <div class="circle right"></div>
                </div>
                <div class="name font-subheading"></div>
                <div class="device-name font-body2"></div>
                <div class="status font-body2"></div>
            </label>`
    }

    constructor(peer) {
        this._peer = peer;
        this._initDom();
        this._bindListeners(this.$el);
    }

    _initDom() {
        const el = document.createElement('x-peer');
        el.id = this._peer.id;
        el.innerHTML = this.html();
        el.ui = this;
        el.querySelector('svg use').setAttribute('xlink:href', this._icon());
        el.querySelector('.name').textContent = this._displayName();
        el.querySelector('.device-name').textContent = this._deviceName();
        this.$el = el;
        this.$progress = el.querySelector('.progress');
    }

    _bindListeners(el) {
        el.querySelector('input').addEventListener('change', e => this._onFilesSelected(e));
        el.addEventListener('drop', e => this._onDrop(e));
        el.addEventListener('dragend', e => this._onDragEnd(e));
        el.addEventListener('dragleave', e => this._onDragEnd(e));
        el.addEventListener('dragover', e => this._onDragOver(e));
        el.addEventListener('contextmenu', e => this._onRightClick(e));
        el.addEventListener('touchstart', e => this._onTouchStart(e));
        el.addEventListener('touchend', e => this._onTouchEnd(e));
        // prevent browser's default file drop behavior
        Events.on('dragover', e => e.preventDefault());
        Events.on('drop', e => e.preventDefault());
    }

    _displayName() {
        return this._peer.name.displayName;
    }

    _deviceName() {
        return this._peer.name.deviceName;
    }

    _icon() {
        const device = this._peer.name.device || this._peer.name;
        if (device.type === 'mobile') {
            return '#phone-iphone';
        }
        if (device.type === 'tablet') {
            return '#tablet-mac';
        }
        return '#desktop-mac';
    }

    _onFilesSelected(e) {
        const $input = e.target;
        const files = $input.files;
        Events.fire('files-selected', {
            files: files,
            to: this._peer.id
        });
        $input.value = null; // reset input
    }

    setProgress(progress) {
        if (progress > 0) {
            this.$el.setAttribute('transfer', '1');
        }
        if (progress > 0.5) {
            this.$progress.classList.add('over50');
        } else {
            this.$progress.classList.remove('over50');
        }
        const degrees = `rotate(${360 * progress}deg)`;
        this.$progress.style.setProperty('--progress', degrees);
        if (progress >= 1) {
            this.setProgress(0);
            this.$el.removeAttribute('transfer');
        }
    }

    _onDrop(e) {
        e.preventDefault();
        const files = e.dataTransfer.files;
        Events.fire('files-selected', {
            files: files,
            to: this._peer.id
        });
        this._onDragEnd();
    }

    _onDragOver() {
        this.$el.setAttribute('drop', 1);
    }

    _onDragEnd() {
        this.$el.removeAttribute('drop');
    }

    _onRightClick(e) {
        e.preventDefault();
        Events.fire('text-recipient', this._peer.id);
    }

    _onTouchStart(e) {
        this._touchStart = Date.now();
        this._touchTimer = setTimeout(_ => this._onTouchEnd(), 610);
    }

    _onTouchEnd(e) {
        if (Date.now() - this._touchStart < 500) {
            clearTimeout(this._touchTimer);
        } else { // this was a long tap
            if (e) e.preventDefault();
            Events.fire('text-recipient', this._peer.id);
        }
    }
}

class Dialog {
    constructor(id) {
        this.$el = $(id);
        this.$el.querySelectorAll('[close]').forEach(el => el.addEventListener('click', e => this.hide()));
        this.$autoFocus = this.$el.querySelector('[autofocus]');
    }

    show() {
        this.$el.setAttribute('show', 1);
        if (this.$autoFocus) this.$autoFocus.focus();
    }

    hide() {
        this.$el.removeAttribute('show');
        document.activeElement.blur();
        window.blur();
    }
}


class ReceiveDialog extends Dialog {

    constructor() {
        super('receiveDialog');
        Events.on('file-received', e => {
            console.log('file-received');
            this._nextFile(e.detail);
            window.blop.play();
        });
        this._filesQueue = [];
    }

    _nextFile(nextFile) {
        if (nextFile) this._filesQueue.push(nextFile);
        if (this._busy) return;
        this._busy = true;
        const file = this._filesQueue.shift();
        this._displayFile(file);
    }

    _dequeueFile() {
        if (!this._filesQueue.length) { // nothing to do
            this._busy = false;
            return;
        }
        // dequeue next file
        setTimeout(_ => {
            this._busy = false;
            this._nextFile();
        }, 300);
    }

    _displayFile(file) {
        const $a = this.$el.querySelector('#download');
        const url = URL.createObjectURL(file.blob);
        $a.href = url;
        $a.download = file.name;

        if (this._autoDownload()) {
            $a.click();
            return;
        }
        if (file.mime.split('/')[0] === 'image') {
            console.log('the file is image');
            this.$el.querySelector('.preview').style.visibility = 'inherit';
            this.$el.querySelector("#img-preview").src = url;
        }

        this.$el.querySelector('#fileName').textContent = file.name;
        this.$el.querySelector('#fileSize').textContent = this._formatFileSize(file.size);
        this.show();

        if (window.isDownloadSupported) return;
        // fallback for iOS
        $a.target = '_blank';
        const reader = new FileReader();
        reader.onload = e => $a.href = reader.result;
        reader.readAsDataURL(file.blob);
    }

    _formatFileSize(bytes) {
        if (bytes >= 1e9) {
            return (Math.round(bytes / 1e8) / 10) + ' GB';
        } else if (bytes >= 1e6) {
            return (Math.round(bytes / 1e5) / 10) + ' MB';
        } else if (bytes > 1000) {
            return Math.round(bytes / 1000) + ' KB';
        } else {
            return bytes + ' Bytes';
        }
    }

    hide() {
        this.$el.querySelector('.preview').style.visibility = 'hidden';
        this.$el.querySelector("#img-preview").src = "";
        super.hide();
        this._dequeueFile();
    }

    _autoDownload() {
        return !this.$el.querySelector('#autoDownload').checked;
    }
}


class JoinRoomDialog extends Dialog {
    constructor() {
        super('joinRoomDialog');
        this.qrcode = new QRCode(document.getElementById("qrcode"), {
            width: 240,
            height: 240
        });
        this.$textRoom = this.$el.querySelector('#roomInput');
        this.$textRoom.value = decodeURIComponent(location.pathname.replace(/\//g, ''));
        this.$textRoom.addEventListener('input', _ => this._makeCode());
        this.$textName = this.$el.querySelector('#nameInput');
        this.$textName.value = localStorage.getItem('nickName') || '';
        this._makeCode();
        this.$el.querySelector('form').addEventListener('submit', e => this._join(e));
        document.getElementById('room').addEventListener('click', _ => this.show());
    }

    _join(e) {
        e.preventDefault();
        if (this.$textRoom.value) {
            roomName = this.$textRoom.value;
            nickName = this.$textName.value;
            localStorage.setItem("nickName", nickName);
            if (decodeURIComponent(location.pathname.replace(/\//g, '')) == roomName) {
                //如果输入的群聊名称跟当前的路径名称相同，则判断是否已连接，若已连接则重命名，若未连接则新建一个连接
                this.hide();
                if (server) {
                    server.reName(nickName);
                } else {
                    server = new ServerConnection(roomName, nickName);
                }
            } else { //如果输入的群聊名称跟当前的路径名称不同，则跳转到新的地址
                window.location.href = location.protocol + '//' + location.host + '/' + encodeURIComponent(roomName);
            }
        } else {
            alert('群聊名称不能为空');
        }
    }

    _makeCode() {
        this.qrcode.makeCode(location.protocol + '//' + location.host + '/' + encodeURIComponent(this.$textRoom.value));
    }
}


class SendTextDialog extends Dialog {
    constructor() {
        super('sendTextDialog');
        Events.on('text-recipient', e => this._onRecipient(e.detail));
        this.$text = this.$el.querySelector('#textInput');
        const button = this.$el.querySelector('form');
        button.addEventListener('submit', e => this._send(e));
    }

    _onRecipient(recipient) {
        this._recipient = recipient;
        this._handleShareTargetText();
        this.show();
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(this.$text);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    _handleShareTargetText() {
        if (!window.shareTargetText) return;
        this.$text.textContent = window.shareTargetText;
        window.shareTargetText = '';
    }

    _send(e) {
        e.preventDefault();
        Events.fire('send-text', {
            to: this._recipient,
            text: this.$text.innerText
        });
    }
}

class ReceiveTextDialog extends Dialog {
    constructor() {
        super('receiveTextDialog');
        Events.on('text-received', e => this._onText(e.detail));
        this.$text = this.$el.querySelector('#text');
        const $copy = this.$el.querySelector('#copy');
        copy.addEventListener('click', _ => this._onCopy());
    }

    _onText(e) {
        this.$text.innerHTML = '';
        const text = e.text;
        if (isURL(text)) {
            const $a = document.createElement('a');
            $a.href = text;
            $a.target = '_blank';
            $a.textContent = text;
            this.$text.appendChild($a);
        } else {
            this.$text.textContent = text;
        }
        this.show();
        window.blop.play();
    }

    async _onCopy() {
        await navigator.clipboard.writeText(this.$text.textContent);
        Events.fire('notify-user', '已保存到剪贴板');
    }
}

class Toast extends Dialog {
    constructor() {
        super('toast');
        this._timerID = {};
        Events.on('notify-user', e => this._onNotfiy(e.detail));
    }

    _onNotfiy(message) {
        this.$el.textContent = message;
        this.show();
        clearTimeout(this._timerID);
        this._timerID = setTimeout(_ => this.hide(), 3000);
    }
}


class NetworkStatusUI {

    constructor() {
        window.addEventListener('offline', e => this._showOfflineMessage(), false);
        window.addEventListener('online', e => this._showOnlineMessage(), false);
        if (!navigator.onLine) this._showOfflineMessage();
    }

    _showOfflineMessage() {
        Events.fire('notify-user', '您的设备已离线');
    }

    _showOnlineMessage() {
        Events.fire('notify-user', '您的设备已上线');
    }
}


class WebShareTargetUI {
    constructor() {
        const parsedUrl = new URL(window.location);
        const title = parsedUrl.searchParams.get('title');
        const text = parsedUrl.searchParams.get('text');
        const url = parsedUrl.searchParams.get('url');

        let shareTargetText = title ? title : '';
        shareTargetText += text ? shareTargetText ? ' ' + text : text : '';

        if (url) shareTargetText = url; // We share only the Link - no text. Because link-only text becomes clickable.

        if (!shareTargetText) return;
        window.shareTargetText = shareTargetText;
        history.pushState({}, 'URL Rewrite', '/');
        console.log('Shared Target Text:', '"' + shareTargetText + '"');
    }
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
        .then(serviceWorker => {
            console.log('Service Worker registered');
            window.serviceWorker = serviceWorker
        });
}

window.addEventListener('beforeinstallprompt', e => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
        // don't display install banner when installed
        return e.preventDefault();
    } else {
        const btn = document.querySelector('#install');
        btn.hidden = false;
        btn.onclick = _ => e.prompt();
        return e.preventDefault();
    }
});