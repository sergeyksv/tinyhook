const argv = require('minimist')(process.argv);
const { Hook } = require('../hook');

if (process.send) {
	const master = new Hook({name: 'master',local:false, port:argv.port });
	master.listen();
	master.once('hook::ready', function () {
		process.send('master::ready');
	});
}
