var Hook = require('../../hook').Hook;
var EventEmitter = require('eventemitter2').EventEmitter2;

var master = new Hook({name: 'master',local:false, silent:true});
var start;
master.listen();
master.on("hook::ready", function () {
	var child1 = new Hook({name: 'child1', silent:true});
	child1.connect();
	child1.on('hook::ready', function () {
		master.spawn([{src:'../testhook.js',name:'child2', silent:true, fork:false}]);
	});
	master.on('child2::hook::ready', function () {
		var count=100000;
		var ri = 0;
		child1.on('*::test_echo', function (i) {
			ri++;
			if (ri==count) {
				var time = new Date().valueOf()-start;
				console.log("Time "+time/1000+"s rps "+count*1000/time);
				process.exit();
			}
		});
		start = new Date().valueOf();
		for (var i=0; i<count; i++) {
			child1.emit('testcmd',{action:'echo',data:i});
		}
	});
});
