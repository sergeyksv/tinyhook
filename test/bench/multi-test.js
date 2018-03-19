var Hook = require('../../hook').Hook;
var master = new Hook({ name: 'master', local: true });
var async = require("async");

master.listen();
master.on("hook::ready", function () {
	async.parallel(getChilds(), () => {
		makeRequests(getChilds().length);
	});

	function getChilds () {
		return [
			createChild(1),
			createChild(2),
			createChild(3),
			createChild(4),
			createChild(5),
			createChild(6),
			createChild(7),
			createChild(8),
			createChild(9)
		]
	}

	function response (cb) {
		master.on("*::test_echo", cb);
	}

	function request () {
		master.emit("testcmd", { action: "echo", data: { hello: "world" }});
	}

	function createChild (number) {
		return function(cb) {
			master.spawn([{ src: "../testhook.js", name: `child${ number }` }]);
			master.on(`child${ number }::hook::ready`, cb);
		}
	}

	function makeRequests (countOfChilds) {
		var start = new Date().valueOf();
		var ttCountSend = 100000;
		var ttCountReceived = ttCountSend * countOfChilds;
		var receivedCount = 0;

		response(function() {
			receivedCount++;
			if (receivedCount !== ttCountReceived) return;
			var time = new Date().valueOf() - start;
			console.log("Time " + time / 1000 + "s rps " + ttCountSend * 1000 / time);
			process.exit();
		});

		for (var i = 0; i < ttCountSend; i++) {
			request();
		}
	}
});
