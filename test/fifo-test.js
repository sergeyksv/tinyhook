var assert = require('assert');
var Hook = require('../hook').Hook;

describe("FIFO", function () {
	[	{local:true, mode:"direct", port:1976},
		{local:false, mode:"netsocket", port:1977},
		{local:false, mode:"fork", port:1978}].
	forEach(function (mode) {
		describe(mode.mode, function() {
		  var master, child;
			it("started master and childs hooks", function (done) {
				master = new Hook({name: 'master',local:mode.local, port:mode.port });
				master.start();
				master.on('hook::ready', function () {
					child1 = new Hook({name: 'child1', port:1976});
					child1.start();
					child1.on('hook::ready', function () {
						master.spawn([{src:__dirname+'/testhook.js',name:'child2', port:mode.port, mode:mode}]);
					});
				});
				master.on('children::ready', function () {
					done();
				});
			});
			it("exchanging messages should follow FIFO approach", function (done) {
				var count=50000;
				var ri = 0;
				var cb = this.callback;
				child1.on('child2::test_echo', function (i) {
					if (i!=ri)
					 	done(new Error("Wrong order of messages"));
					ri++;
					if (ri==count)
						done();
				});
				for (var i=0; i<count; i++) {
					child1.emit('testcmd',{action:'echo',data:i});
				}
			});
		});
	});
});
