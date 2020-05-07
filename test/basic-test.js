const assert = require('assert');
const { Hook } = require('../hook');

describe('Standalone', function () {
	let hook;
	it('should start',function (done) {
		hook = new Hook({name:'local'});
		hook.on('hook::ready', function () {
			done();
		});
		hook.start();
	});
	it('should listen',function () {
		assert.equal(hook.listening, true);
	});
	it('have a proper name',function () {
		assert.equal(hook.name, 'local');
	});
	it('should receive local named event without namespace',function (done) {
		hook.once('someevent', function (msg) {
			assert.equal(msg,'somedata');
			done();
		});
		hook.emit('someevent','somedata');
	});
	it('should receive local wildcard event', function (done) {
		hook.once('*', function (msg) {
			assert.equal(msg,'somedata');
			done();
		});
		hook.emit('someevent','somedata');
	});
	it('should stop when requested', function (done) {
		hook.stop(function () {
			assert.equal(hook.ready,false);
			assert.equal(hook.listening,false);
			done();
		});
	});
});

describe('Master & childs', function () {
	[	{local:true, mode:"direct", port:1990},
		{local:false, mode:"netsocket", port:1991},
		{local:false, mode:"fork", port:1992}].
	forEach(function (mode) {
		describe(mode.mode, function() {
			let topic;
			it("Started alltogether", function (done) {
				topic = {
					master: new Hook({name:'master',local:mode.local, mode:mode.mode, port:mode.port}),
					child1: new Hook({name:'child1',local:mode.local, mode:mode.mode, port:mode.port}),
					child2: new Hook({name:'child2',local:mode.local, mode:mode.mode, port:mode.port}),
					child3: new Hook({name:'child3',local:mode.local, mode:mode.mode, port:mode.port})
				};
				topic.master.listen(function () {
					topic.child1.connect();
					topic.child2.connect();
					topic.child3.connect();
					let ch = 3;
					function readyCallback() {
						ch--; if (ch===0) done();
					}
					topic.child1.on('hook::ready', readyCallback);
					topic.child2.on('hook::ready', readyCallback);
					topic.child3.on('hook::ready', readyCallback);
				});
			});
			it('master listens',function () {
				assert.equal(topic.master.listening, true);
			});
			it('master has right name', function () {
				assert.equal(topic.master.name, 'master');
			});
			it('child1 ready',function () {
				assert.equal(topic.child1.ready, true);
			});
			it('child1 has right name',function () {
				assert.equal(topic.child1.name, 'child1');
			});
			it('child2 ready',function () {
				assert.equal(topic.child2.ready, true);
			});
			it('child2 has right name',function () {
				assert.equal(topic.child2.name, 'child2');
			});
			it('child3 ready',function () {
				assert.equal(topic.child3.ready, true);
			});
			it('child3 has right name',function () {
				assert.equal(topic.child3.name, 'child3');
			});
			it('child send message to master', function (done) {
				topic.master.once('child1::someevent', function (msg) {
					assert.equal(msg,'somedata');
					done();
				});
				topic.child1.emit('someevent','somedata');
			});
			it('master send message to child', function (done) {
				// we can emit event from master only when we get know
				// that client is listening for our event
				topic.master.once('hook::newListener', function (data) {
					if (data.type == 'master::someevent' && data.hook=='child1') {
						topic.master.emit('someevent','somedata');
					}
				});
				topic.child1.once('master::someevent', function (msg) {
					assert.equal(msg,'somedata');
					done();
				});
			});
			it('child can be stopped not affecting others', function (done) {
				topic.child3.stop(function () {
					assert.equal(topic.child3.ready,false);
					assert.equal(topic.child3.listening,false);
					done();
				});
			});
			it('client receive messages from another client', function (done) {
				topic.child2.on('*::hook::newListener', function (data) {
					if (data.type == 'child2::someevent') {
						topic.child2.emit('someevent','somedata');
					}
				});
				topic.child1.once('child2::someevent', function (msg) {
					assert.equal(msg,'somedata');
					done();
				});
			});/*
			describe("master can be restarted not affecting childs", function () {
				it('master stopped', function (done) {
					topic.master.stop(function () {
						done();
					});
				})
				it('master start', function (done) {
					topic.master.start(done);
				})
				it('client receive messages from another client', function (done) {
					topic.child1.once('child2::someevent', function (msg) {
						assert.equal(msg,'somedata');
						done();
					});
					topic.child2.emit('someevent','somedata');
				});
			});*/
		});
	});
});
