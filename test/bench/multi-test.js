var Hook = require('../../hook').Hook;
var EventEmitter = require('eventemitter2').EventEmitter2;
var master = new Hook({name: 'master',local:false, silent:true});
var async = require("async");
var start;

master.listen();
master.on("hook::ready", function () {
    
    master.spawn([
        { src: "../testhook.js", name: "child1", silent: true, fork: false },
        { src: "../testhook.js", name: "child2", silent: true, fork: false },
        { src: "../testhook.js", name: "child3", silent: true, fork: false },
        { src: "../testhook.js", name: "child4", silent: true, fork: false },
        { src: "../testhook.js", name: "child5", silent: true, fork: false }
    ]);

    async.parallel([
        function(cb) {
            master.on("child1::hook::ready", cb);
        },
        function(cb) {
            master.on("child2::hook::ready", cb);
        },
        function(cb) {
            master.on("child3::hook::ready", cb);
        },
        function(cb) {
            master.on("child4::hook::ready", cb);
        },
        function(cb) {
            master.on("child5::hook::ready", cb);
        }
    ], function(err) {
        if (err) throw err;

        // time with reduce serializers 0.997 sec 
        // time without reduce serializers 0.997 sec 
        var count=1000;
        var ttReceiveCount = count * 5;
		var receivedRequests = 0;
		master.on('*::test_echo', function (i) {
			receivedRequests++;
			if (receivedRequests === ttReceiveCount) {
				var time = new Date().valueOf()-start;
				console.log("Time "+time/1000+"s rps "+count*1000/time);
				process.exit();
			}
		});
		start = new Date().valueOf();
		for (var i=0; i<count; i++) {
			master.emit('testcmd', { action: "echo", data: { hello: "world" }});
		}
    });
});
