const { Hook } = require('../../hook');
const master = new Hook({ name: 'master', local: false });
const safe = require("safe");

master.listen();
master.on("hook::ready", function () {
	safe.parallel(getChilds(), function () {
		makeRequests(getChilds().length);
	});

	function getChilds () {
		return [
			createChild(1),
			createChild(2),
			createChild(3),
			createChild(4),
			createChild(5)
		];
	}

	function response (cb) {
		master.on("*::test_echo", cb);
	}

	function request () {
		master.emit("testcmd", { action: "echo", data: { hello: "world" }});
	}


	function createChild (number) {
		return function(cb) {
			master.spawn([{ src: "../testhook.js", name: `child${number}` }]);
			master.on(`child${number}::hook::ready`, cb);
		};
	}

	function makeRequests (countOfChilds) {
		const start = Date.now();
		const ttCountSend = 10000;
		const ttCountReceived = ttCountSend * countOfChilds;
		let receivedCount = 0;

		response(function() {
			receivedCount++;
			if (receivedCount !== ttCountReceived) return;
			const time = Date.now() - start;
			console.log(`Time ${time / 1000}s rps ${ttCountSend * 1000 / time}`);
			process.exit();
		});

		for (let i = 0; i < ttCountSend; i++) {
			request();
		}
	}
});
