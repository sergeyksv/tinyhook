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
			var bcmd=2;
			it("setup chields to listen ballanced", function (done) {
				master.emit("testcmd", { action: "ballance", data: { ballanceSel:2, ballanceName:"child2", ballanceFn: "return arguments[0].node;" }});
				master.emit("testcmd", { action: "ballance", data: { ballanceSel:3, ballanceName:"child3", ballanceFn: "return arguments[0].node;" }});
				master.on("*::ballancecmd::ready", function () {
					bcmd--;
					if (bcmd==0)
						done()
				})
			})
			it("test applied filter", function (done) {
				master.onFilter("testcmd", function(msg, idListener) {
					if (msg.data.n === 1 && idListener === 0) return true;
					if (msg.data.n === 2 && idListener === 1) return true;
				});

				var numberLast = 0; numberProc = 2;
				master.on("*::ballance_echo", function(data) {
					numberLast += data;
					if (data==0) {
						numberProc--;
						if (numberProc==0) {
							if (numberLast === 15) done();
								else done(new Error("Something goes wrong, summ 15 is not equal to ",numberLast));
						}
					}
				});

				master.emit("ballancecmd", { node:2, data: { n: 1 }});
				master.emit("ballancecmd", { node:3, data: { n: 2 }});
				master.emit("ballancecmd", { node:2, data: { n: 7 }});
				master.emit("ballancecmd", { node:3, data: { n: 5 }});
				master.emit("ballancecmd", { node:2, data: { n: 0 }});
				master.emit("ballancecmd", { node:3, data: { n: 0 }});
			});
		});
	});
});
