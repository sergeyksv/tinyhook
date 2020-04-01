const { Hook } = require('../../hook');

class Slave extends Hook {
	constructor (options) {
		super(options);

		this.on('hook::ready', function () {
			this.on('*::someEvent', function (msg) {
			});
		});
	}
}

exports.Slave = Slave;
