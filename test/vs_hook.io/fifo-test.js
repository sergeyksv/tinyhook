var Hook = require('hook.io').Hook;
var EventEmitter = require('eventemitter2').EventEmitter2

var master = new Hook({name: 'master',local:false, silent:true});
master.listen();
master.on("hook::ready", function () {
	var child1 = new Hook({name: 'child1', silent:true});
	child1.connect();
	child1.on('hook::ready', function () {
		master.spawn([{src:'../testhook.js',name:'child2', silent:true, fork:true}]);
	});
	master.on('child2::hook::ready', function () {
		var count=100000;
		var ri = 0;
		child1.on('*::test_echo', function (i) {
			ri++;
			if (ri==count) {
				console.timeEnd("Hook");
				process.exit();
			}
		});
		console.time("Hook");
		for (var i=0; i<count; i++) {
			child1.emit('testcmd',{action:'echo',data:i});
		}
	});
});
