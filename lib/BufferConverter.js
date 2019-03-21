"use strict";

module.exports = class BufferConverter {
	constructor() {
		this.packets = [];
		this.len = 0; // total length
		this.elen = 4; // element length
		this.state = 0;
		this.message = undefined;
	}

	/**
	 * We use message as object and data as object
	 *
	 * @returns {Buffer}
	 * @param {Object} message
	 * @param {Object} data
	 */
	serializeNormal(message, data) {
		const strMessage = JSON.stringify(message);
		const strData = data!==undefined?JSON.stringify(data):"";
		const lenMessage = Buffer.byteLength(strMessage,"utf-8");
		const lenData = Buffer.byteLength(strData,"utf-8");
		const buffer= Buffer.allocUnsafe(8 + lenMessage + lenData);
		buffer.writeUInt32BE(lenMessage, 0);
		buffer.write(strMessage, 4, "utf-8");
		buffer.writeUInt32BE(lenData, 4+lenMessage);
		buffer.write(strData, 8 + lenMessage, "utf-8");
		return buffer;
	}

	/**
	 * We use message as object and data as object
	 *
	 * @returns {Buffer}
	 * @param {Object} message
	 * @param {Buffer} data
	 */
	serializeFast(message, data) {
		const strMessage = JSON.stringify(message);
		const lenMessage = Buffer.byteLength(strMessage,"utf-8");
		const lenData = data!==undefined?data.length:0;
		const buffer= Buffer.allocUnsafe(8 + lenMessage + lenData);
		buffer.writeUInt32BE(lenMessage, 0);
		buffer.write(strMessage, 4, "utf-8");
		buffer.writeUInt32BE(lenData, 4+lenMessage);
		if (data)
			data.copy(buffer, 8 + lenMessage);
		return buffer;
	}

	/**
	 * callback of deserialize
	 */
	onDone(messageObj, dataBuffer) {}

	takeChunk(buffer) {
		this.len += buffer.length;
		let idx = 0;
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
					this.message = JSON.parse(buffer.toString("utf-8", idx, idx + this.elen));
					idx += this.elen;
					this.state = 2; this.elen = 4;
					break;
				case 2:
					this.elen = buffer.readUInt32BE(idx);
					idx+=4;
					if (this.elen==0) { // no data in packet
						this.state = 0; this.elen = 4;
						this.onDone(this.message);
					} else this.state = 3;
					break;
				case 3:
					this.onDone(this.message, buffer.slice(idx, idx + this.elen));
					this.message = undefined;
					idx += this.elen;
					this.state = 0; this.elen = 4;
					break;
			}
		}
		if (idx === 0) // no any buffer processed, just store it
			this.packets.push(buffer);
		else if (idx < this.len) { // if buffer processed and something remains, store remains
			this.packets.push(buffer.slice(idx));
			this.len = this.packets[0].length;
		} else {
			this.len = 0;
		}
	}
};
