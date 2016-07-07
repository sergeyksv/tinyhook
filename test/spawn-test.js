var assert = require('assert');
var Hook = require('../hook').Hook;


describe("Spawn hooks", function () {
	[	{name:"in process",local:true, mode:"direct", port:1980},
		{name:"inter process net socket",local:false, mode:"netsocket", port:1981},
		{name:"inter process fork ipc",local:false, mode:"fork", port:1982}].
	forEach(function (mode) {
		describe(mode.name, function () {
			var master = new Hook({name: 'master',local:mode.local, port:mode.port });
			it("master should start and spawn child", function (done) {
				master.start();
				master.once('hook::ready', function () {
					assert(master._server);
					master.spawn([{src:__dirname+'/testhook.js',name:'child', mode:mode.mode, port:mode.port}]);
				});
				master.once('hook::children-ready', function () {
					done();
				});
			});
			it("child should be in "+(mode.local?"same":"different")+" process", function (done) {
				master.once('child::test_getpid', function (pid) {
					if (mode.local)
						assert.equal(pid,process.pid);
					else
						assert.notEqual(pid,process.pid);
					done();
				});
				master.emit('testcmd',{action:'getpid'});
			});
			it("child should run in " + mode.mode +" mode", function (done) {
				master.once('child::test_getmode', function (m) {
					assert.equal(m,mode.mode);
					done();
				});
				master.emit('testcmd',{action:'getmode'});
			});
			it("child should respond to echo", function (done) {
				master.once('child::test_echo', function (echo) {
					assert.equal(echo,'ilovetinyhook');
					done();
				});
				master.emit('testcmd',{action:'echo',data:'ilovetinyhook'});
			});
			if (mode.mode != "direct") {
				it("being restarted should keep working", function (done) {
					// pollute us with messages during tinyhook restart
					var noice = setTimeout(function () {
						master.emit('testcmd',{action:'noop',data:''});
					}, 50);

					// this should kill child (we ask him)
					// then it should restart and notify us that we ready
					master.once('child::hook::ready', function () {
						master.once('child::test_echo', function (echo) {
							assert.equal(echo,'lovedagain');
							clearTimeout(noice);
							done();
						});
						master.emit('testcmd',{action:'echo',data:'lovedagain'});
					});
					master.emit('testcmd',{action:'exit',data:''});
				});
			}
		});
	});
});
