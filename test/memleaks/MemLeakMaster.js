var Hook = require('../../hook').Hook;

var hook = new Hook( {
    name: 'MemLeakMaster',
    silent: true,
    local:true,
    oneway:true
});

hook.on('hook::ready', function () {
	hook.spawn([{src:'../MemLeakSlave.js',name:'MemLeakSlave', silent:true,oneway:true},
		{src:'../MemLeakChild.js',name:'MemLeakChild', silent:true,oneway:true},
		{src:'../MemLeakChild.js',name:'MemLeakChild', silent:true,oneway:true}]);
});

hook.start();
