const assert = require('assert');
const { Hook } = require('../hook');
const child_process = require("child_process");

describe("Master", function () {
	let child = null, child1, child2;
	after(function () {
		if (child) {
			child.kill();
		}
	});
	it("start in separate process", function (done) {
			child = child_process.fork(`${__dirname}/testmaster`, ["--port=1950"]);
			child.on("message", function (msg) {
				if (msg == "master::ready")
					done();
			});
	});
	it("child1 started", function (done) {
		child1 = new Hook({name: 'child1', port:1950});
		child1.connect();
		child1.once('hook::ready', function () {
			setTimeout(done, 100);
		});
	});
	it("child2 started", function (done) {
		child2 = new Hook({name: 'child2', port:1950});
		child2.connect();
		child2.once('hook::ready', function () {
			done();
		});
	});
	it('client receive messages from another client', function (done) {
		child1.once('child2::someevent', function (msg) {
			assert.equal(msg,'somedata');
			done();
		});
		child2.emit('someevent','somedata');
	});
	it("restart master ", function (done) {
			let wc = 3;
			child.kill();
			child.once('exit', function () {
				child = child_process.fork(`${__dirname}/testmaster`, ["--port=1950"]);
				child.on("message", function (msg) {
					if (msg == "master::ready") {
						if (!(--wc)) done();
					}
				});
				child1.once('hook::reconnected', function () {
					if (!(--wc)) done();
				});
				child2.once('hook::reconnected', function () {
					if (!(--wc)) done();
				});
			});
	});
	it('client still receive messages from another client', function (done) {
		child1.once('child2::someevent', function (msg) {
			assert.equal(msg,'somedata');
			done();
		});
		child2.emit('someevent','somedata');
	});
});
