var Hook = require('hook.io').Hook;
var util = require('util');

var TestHook = exports.TestHook = function (options) {
	Hook.call(this, options);
		
	this.on('*::testcmd', function (cmd) {
		if (cmd.action == 'echo')
			this.emit('test_echo', cmd.data);
		else if (cmd.action == 'getpid') 
			this.emit('test_getpid', process.pid)
	})
}

util.inherits(TestHook, Hook);
