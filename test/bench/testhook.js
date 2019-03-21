const { Hook } = require('hook.io');

class TestHook extends Hook {
	constructor(options) {
		super(options);

		this.on('*::testcmd', function (cmd) {
			if (cmd.action == 'echo')
				this.emit('test_echo', cmd.data);
			else if (cmd.action == 'getpid')
				this.emit('test_getpid', process.pid);
		});
	}
}

exports.TestHook = TestHook;