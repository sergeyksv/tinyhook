var argv = require('optimist').argv;
var Hook = require('../hook').Hook;

if (process.send) {
  var master = new Hook({name: 'master',local:false, port:argv.port });
  master.listen();
  master.once('hook::ready', function () {
    process.send('master::ready');
  });
}
