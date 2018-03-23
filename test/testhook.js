var Hook = require('../hook').Hook;
var util = require('util');

var TestHook = exports.TestHook = function (options) {
	Hook.call(this, options);
	var self = this;

	this.on('*::testcmd', function (cmd) {
		if (cmd.action == 'echo')
			this.emit('test_echo', cmd.data);
		else if (cmd.action == 'getpid')
			this.emit('test_getpid', process.pid);
		else if (cmd.action == 'getmode')
			this.emit('test_getmode', this._hookMode);
		else if (cmd.action == 'exit') {
			process.exit(1);
		} else if (cmd.action == 'ballance') {
			if (self.name == cmd.data.ballanceName) {
				self.onFilter("*::ballancecmd",cmd.data.ballanceSel, self.name, new Function(cmd.data.ballanceFn), function (obj) {
					self.emit('ballance_echo', obj.data.n);
				})
				self.emit("ballancecmd::ready");
			}
		}
	});
};

util.inherits(TestHook, Hook);
