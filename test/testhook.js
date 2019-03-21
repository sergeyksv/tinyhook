const { Hook } = require('../hook');

class TestHook extends Hook {
	constructor(options) {
		super(options);

		const ballanceEcho = (obj) => {
			this.emit('ballance_echo', obj.data.n);
		};

		this.on('*::testcmd', (cmd) => {
			if (cmd.action == 'echo')
				this.emit('test_echo', cmd.data);
			else if (cmd.action == 'getpid')
				this.emit('test_getpid', process.pid);
			else if (cmd.action == 'getmode')
				this.emit('test_getmode', this._hookMode);
			else if (cmd.action == 'exit') {
				process.exit(1);
			} else if (cmd.action == 'ballance') {
				if (this.name == cmd.data.ballanceName) {
					if (cmd.data.action=='on') {
						// !!!! empty function below is just to ensure that normal `on`
						// and `onFilter` will not conflict to eachother
						this.on("*::ballancecmd", function (obj) {
						});
						this.onFilter("*::ballancecmd",cmd.data.ballanceSel, this.name, new Function(cmd.data.ballanceFn), ballanceEcho);
					} else if (cmd.data.action=='off') {
						this.off("*::ballancecmd",ballanceEcho);
					}
					this.emit("ballancecmd::ready");
				}
			}
		});
	}
}

exports.TestHook = TestHook;