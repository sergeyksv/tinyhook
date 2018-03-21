var assert = require('assert');
var Hook = require('../hook').Hook;

describe("FILTER", function () {
	[	{mode:"direct", port: 2000},
		{mode:"netsocket", port: 2001},
		{mode:"fork", port: 2002}
	].
	forEach(function (mode) {
		describe(mode.mode, function() {
			var master, child1;
			it("started master and childs hooks", function (done) {
				master = new Hook({name: 'master', local: true, port: mode.port});
				master.start();
				master.on('hook::ready', function () {
					master.spawn([{ src:__dirname+'/testhook.js',name:'child2', port: mode.port }]);
					master.spawn([{ src:__dirname+'/testhook.js',name:'child3', port: mode.port }]);
				});

				var r = 0;
				master.on('hook::children-ready', function () {
					r++;
					if (r === 2) done();
				});
			});
			it("test applied filter", function (done) {
				master.onFilter("testcmd", function(msg, idListener) {
					if (msg.data.n === 1 && idListener === 0) return true;
					if (msg.data.n === 2 && idListener === 1) return true;
				});

				var numberLast = 0;
				master.on("*::test_echo", function(data) {
					numberLast += data.n;
					if (numberLast === 3) done();
					if (numberLast === 6) throw new Error("Filter should be applied");
				});

				master.emit("testcmd", { action: "echo", data: { n: 1 }});
				master.emit("testcmd", { action: "echo", data: { n: 2 }});
			});
		});
	});
});
