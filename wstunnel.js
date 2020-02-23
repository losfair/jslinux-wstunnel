function WsTunnel(url)
{
    try {
        this.socket = new WebSocket(url);
    } catch(err) {
        this.socket = null;
        console.log("Could not open websocket url=" + url);
        return;
    }
    this.socket.binaryType = 'arraybuffer';
    this.socket.onmessage = this.messageHandler.bind(this);
    this.socket.onclose = this.closeHandler.bind(this);
    this.socket.onopen = this.openHandler.bind(this);
    this.socket.onerror = this.errorHandler.bind(this);
}

WsTunnel.prototype.openHandler = function(e)
{
    net_set_carrier(1);
}

WsTunnel.prototype.closeHandler = function(e)
{
    net_set_carrier(0);
}

WsTunnel.prototype.errorHandler = function(e)
{
    console.log("Websocket error=" + e);
}

WsTunnel.prototype.messageHandler = function(e)
{
    var str, buf_len, buf_addr, buf;
    if (e.data instanceof ArrayBuffer) {
        buf_len = e.data.byteLength;
        buf = new Uint8Array(e.data);
        buf_addr = _malloc(buf_len);
        HEAPU8.set(buf, buf_addr);
        net_write_packet(buf_addr, buf_len);
        _free(buf_addr);
    } else {
        str = e.data.toString();
        if (str.substring(0, 5) == "ping:") {
            try {
                this.socket.send('pong:' + str.substring(5));
            } catch (err) {
            }
        } else {
            console.log(str)
        }
    }
}

WsTunnel.prototype.recv_packet = function(buf)
{
    if (this.socket) {
        try {
            console.log(buf);
            this.socket.send(buf);
        } catch (err) {
        }
    }
}