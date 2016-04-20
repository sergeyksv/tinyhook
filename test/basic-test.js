var assert = require('assert');
var Hook = require('../hook').Hook;

describe('Standalone', function () {
	var hook;
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
	var topic;
	it("Started alltogether", function (done) {
		topic = {
			master: new Hook({name:'master'}),
			child1: new Hook({name:'child1'}),
			child2: new Hook({name:'child2'}),
			child3: new Hook({name:'child3'})
		};
		topic.master.start();
		topic.child1.start();
		topic.child2.start();
		topic.child3.start();
		var ch = 3;
		function readyCallback() {
			ch--; if (ch===0) done();
		}
		topic.child1.on('hook::ready', readyCallback);
		topic.child2.on('hook::ready', readyCallback);
		topic.child3.on('hook::ready', readyCallback);
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
		topic.master.on('hook::newListener', function (type, hookName) {
			if (type == 'master::someevent' && hookName=='child1') {
				topic.master.emit('someevent','somedata');
			}
		});
		topic.child1.once('master::someevent', function (msg) {
			assert.equal(msg,'somedata');
			done();
		});
	});
	it('client receive messages from another client', function (done) {
		topic.child1.once('child2::someevent', function (msg) {
			assert.equal(msg,'somedata');
			done();
		});
		topic.child2.emit('someevent','somedata');
	});
	it('child can be stopped not affecting others', function (done) {
		topic.child3.stop(function () {
			assert.equal(topic.child3.ready,false);
			assert.equal(topic.child3.listening,false);
			done();
		});
	});
});
