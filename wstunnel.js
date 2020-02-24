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
    this.self_mac = null;
    this.remote_mac = new Uint8Array([0, 0, 0, 0, 0, 0]);
    this.netconf = null;
    this.onnetconf = null;
    this.netconf_received = false;
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
        this._do_send_packet(new Uint8Array(e.data));
    } else {
        str = e.data.toString();
        if(!this.netconf_received) {
            this.netconf_received = true;
            this.netconf = JSON.parse(str);
            if(this.onnetconf) {
                this.onnetconf(this.netconf);
            }
        }
    }
}

WsTunnel.prototype._do_send_packet = function(buf, ethertype = null) {
    if(!(buf instanceof Uint8Array)) {
        throw new TypeError();
    }

    if(!this.self_mac) {
        throw new Error("Self MAC address is unknown. Send a packet first.");
    }

    let pkt = new Uint8Array(14 + buf.byteLength);
    pkt.set(this.self_mac, 0);
    pkt.set(this.remote_mac, 6);

    if(ethertype !== null) {
        pkt[12] = ethertype >> 8;
        pkt[13] = ethertype & 0xff;
    } else {
        let proto = buf[0] >> 4;
        if(proto == 4) {
            pkt[12] = 0x08;
            pkt[13] = 0x00;
        } else if(proto == 6) {
            pkt[12] = 0x86;
            pkt[13] = 0xdd;
        } else {
            console.log("_do_send_packet: unknown protocol");
            return;
        }
    }
    pkt.set(buf, 14);

    let buf_addr = _malloc(pkt.length);
    HEAPU8.set(pkt, buf_addr);
    net_write_packet(buf_addr, pkt.length);
    _free(buf_addr);
}

WsTunnel.prototype.recv_packet = function(buf)
{
    if(!(buf instanceof Uint8Array)) throw new TypeError();

    if (this.socket) {
        try {
            let dstMac = buf.slice(0, 6);
            let srcMac = buf.slice(6, 12);
            let etherType = new Uint16Array(buf.slice(12, 14).buffer)[0];
            etherType = (etherType >> 8) | ((etherType & 0xff) << 8);

            if(this.self_mac === null) {
                this.self_mac = srcMac;
            }

            if(etherType == 0x0806) {
                // ARP. Clone the packet before modification.
                buf = new Uint8Array(buf);
                if(!(buf instanceof Uint8Array)) throw new TypeError();
                let hardwareType = new Uint16Array(buf.buffer, 14, 2);
                let protocolType = new Uint16Array(buf.buffer, 16, 2);
                let hwAddrLen = new Uint8Array(buf.buffer, 18, 1);
                let protoAddrLen = new Uint8Array(buf.buffer, 19, 1);
                let operation = new Uint16Array(buf.buffer, 20, 2);
                let senderHwAddr = new Uint8Array(buf.buffer, 22, 6);
                let senderProtoAddr = new Uint8Array(buf.buffer, 28, 4);
                let targetHwAddr = new Uint8Array(buf.buffer, 32, 6);
                let targetProtoAddr = new Uint8Array(buf.buffer, 38, 4);
                if(
                    hardwareType[0] != 0x0100 ||
                    protocolType[0] != 0x0008 ||
                    hwAddrLen[0] != 6 ||
                    protoAddrLen[0] != 4 ||
                    operation[0] != 0x0100
                ) {
                    throw new Error("unexpected ARP fields");
                }
                console.log("ARP sender:", senderHwAddr, senderProtoAddr);
                console.log("ARP target:", targetHwAddr, targetProtoAddr);
                {
                    let x = new Uint8Array(senderHwAddr);
                    senderHwAddr.set(this.remote_mac);
                    targetHwAddr.set(x);

                    x = new Uint8Array(senderProtoAddr);
                    senderProtoAddr.set(targetProtoAddr);
                    targetProtoAddr.set(x);
                }
                operation[0] = 0x0200;
                this._do_send_packet(buf.slice(14), 0x0806);
            } else {
                this.socket.send(buf.slice(14));
            }
        } catch (err) {
            console.log(err);
        }
    }
}
