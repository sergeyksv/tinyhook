const { Hook } = require('../../hook');

class RealMessage {
	constructor () {
		this.bigData = "";
		let i = 0;
		for (; i < 10; i++) {
			this.bigData += "Some simulation of data";
		}
	}
}

class Slave extends Hook {
	constructor (options) {
		super(options);
		let count = 0;
		let l = 0;

		const emitEvent = () => {
			count++;
			this.emit("someEvent", new RealMessage());

			if (count == 100) {
				count = 0;
				console.log(l++, "--------------------------------------");
				setTimeout(emitEvent, 20);
			} else
				setImmediate(emitEvent);
		};

		this.on('hook::ready', function () {
			console.log(this._hookMode);
			emitEvent();
		});
	}
}

exports.Slave = Slave;