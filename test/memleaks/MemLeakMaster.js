const { Hook } = require('../../hook');

const hook = new Hook({
	name: 'MemLeakMaster',
	silent: true,
	local: false,
	oneway: true
});

hook.on('hook::ready', function () {
	hook.spawn([{ src: './MemLeakSlave.js', name: 'MemLeakSlave', silent: true, oneway: true },
	{ src: './MemLeakChild.js', name: 'MemLeakChild', silent: true, oneway: true },
	{ src: './MemLeakChild.js', name: 'MemLeakChild', silent: true, oneway: true }]);
});

hook.start();
