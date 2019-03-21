const { Hook } = require('../../hook');

const master = new Hook({name: 'master',local:false, silent:true});
let start;
master.listen();
master.on("hook::ready", function () {
	const child1 = new Hook({name: 'child1', silent:true});
	child1.connect();
	child1.on('hook::ready', function () {
		master.spawn([{src:'../testhook.js',name:'child2', silent:true, fork:false}]);
	});
	master.on('child2::hook::ready', function () {
		const count=100000;
		let ri = 0;
		child1.on('*::test_echo', function (i) {
			ri++;
			if (ri==count) {
				const time = Date.now()-start;
				console.log(`Time ${time/1000}s rps ${count*1000/time}`);
				process.exit();
			}
		});
		start = Date.now();
		for (let i=0; i<count; i++) {
			child1.emit('testcmd',{action:'echo',data:i});
		}
	});
});
