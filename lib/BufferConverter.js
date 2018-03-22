module.exports = BufferConverter;

function BufferConverter () {
	this.packets = [];
	this.len = 0; // total length
	this.elen = 4; // element length
	this.state = 0;
}

BufferConverter.prototype = {
	serialize: serialize,
	deserialize: deserialize,
	onDone: onDone,
	takeFullBuffer: takeFullBuffer
};

/**
 * We use message as object
 *
 * @param {Object} message
 * @returns {Buffer}
 */
function serialize (message) {
	var str = JSON.stringify(message);
	var buffer= Buffer.allocUnsafe(4 + Buffer.byteLength(str,"utf-8"));
	buffer.writeUInt32BE(buffer.length - 4, 0);
	buffer.write(str, 4, "utf-8");
	return buffer;
}

/**
 * callback of deserialize
 */
function onDone (buffer, idx, elen) {}

function takeFullBuffer (buffer) {
	this.len += buffer.length;
	var idx = 0;
	while (this.len >= (this.elen + idx)) {
		if (this.packets.length) {
			this.packets.push(buffer);
			buffer = Buffer.concat(this.packets, this.len);
			this.packets = [];
		}
		switch (this.state) {
			case 0:
				this.elen = buffer.readUInt32BE(idx);
				idx+=4; this.state=1;
				break;
			case 1:
				var b;
				if (idx === 0) {
					b = buffer.slice(idx, idx + this.elen);
					var l = b.length;
					b = Buffer.concat([ Buffer.allocUnsafe(4), b ]);
					b.writeUInt32BE(l, 0);
				} else {
					b = buffer.slice(idx - 4, idx + this.elen);
				}
				this.onDone(b);
				idx += this.elen;
				this.state = 0; this.elen = 4;
		}
	}
	if (idx === 0)  // no any buffer processed, just store it
		this.packets.push(buffer);
	else if (idx < this.len) { // if buffer processed and something remains, store remains
		this.packets.push(buffer.slice(idx));
		this.len = this.packets[0].length;
	} else {
		this.len = 0;
	}
}

function deserialize (buffer) {
	return _deserialize(buffer, 4);
}

function _deserialize (buffer, idx, len) {
	var str = buffer.toString("utf-8", idx, len);
	try {
		return JSON.parse(str);
	} catch (e) {
		var errMessage = str ? str : "Empty string";
		console.error(errMessage);
		throw e;
	}
}