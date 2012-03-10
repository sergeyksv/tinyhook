var vows = require('vows');
var assert = require('assert');
var Hook = require('../hook').Hook;

vows.describe('Basic ops: start, stop, listen, emit').addBatch({
	'Standalone':{
		topic: function () {
			var hook = new Hook({name:'local'});
			hook.on('hook::ready', this.callback.bind(hook,null,hook));
			hook.start();
		}, 
		'should listen':function (hook) {
			assert.equal(hook.listening, true);
		},		
		'have a proper name':function (hook) {
			assert.equal(hook.name, 'local');
		},		
		'should receive local named event without namespace':{
			topic: function (hook) {
				hook.once('someevent', this.callback.bind(hook,null));
				hook.emit('someevent','somedata');
			},
			'event received': function (msg) {
				assert.equal(msg,'somedata');
			}
		},
		'should receive local wildcard event':{
			topic: function (hook) {
				hook.once('*', this.callback.bind(hook,null));
				hook.emit('someevent','somedata');
			},
			'event received': function (msg) {
				assert.equal(msg,'somedata');
			}
		},
		'should stop when requested':{
			topic: function (hook) {
				hook.stop(this.callback.bind(hook,null,hook));
			},
			'stopped': function (hook) {
				assert.equal(hook.ready,false);
				assert.equal(hook.listening,false);
			}
		}
	}
}).addBatch({
	'Master & childs':{
		topic: function () {
			var topic = {
				master: new Hook({name:'master'}),
				child1: new Hook({name:'child1'}),
				child2: new Hook({name:'child2'}),
				child3: new Hook({name:'child3'})
			}
			topic.master.start();
			topic.child1.start();
			topic.child2.start();
			topic.child3.start();
			// give some time to hooks to establish relations
			setTimeout(this.callback.bind(this, null,topic), 500);
		}, 
		'master listens':function (topic) {
			assert.equal(topic.master.listening, true);
		},		
		'master has right name':function (topic) {
			assert.equal(topic.master.name, 'master');
		},
		'child1 ready':function (topic) {
			assert.equal(topic.child1.ready, true);
		},		
		'child1 has right name':function (topic) {
			assert.equal(topic.child1.name, 'child1');
		},
		'child2 ready':function (topic) {
			assert.equal(topic.child2.ready, true);
		},		
		'child2 has right name':function (topic) {
			assert.equal(topic.child2.name, 'child2');
		},
		'child3 ready':function (topic) {
			assert.equal(topic.child3.ready, true);
		},		
		'child3 has right name':function (topic) {
			assert.equal(topic.child3.name, 'child3');
		},
		', child send message to master':{
			topic:function(topic) {
				topic.master.once('child1::someevent', this.callback.bind(this,null));
				topic.child1.emit('someevent','somedata');
			},
			'event received': function (msg) {
				assert.equal(msg,'somedata');
			}
		},
		', master send message to child':{
			topic:function(topic) {
				topic.child1.once('master::someevent', this.callback.bind(this,null));
				// we need allow warmup time to let server and client to talk 
				// to each other
				setTimeout(function () {
					topic.master.emit('someevent','somedata');
				}, 100);
			},
			'event received': function (msg) {
				assert.equal(msg,'somedata');
			} 
		},
		', client receive messages from another client':{
			topic:function(topic) {
				topic.child1.once('child2::someevent', this.callback.bind(this,null));
				// we need allow warmup time to let server and client to talk 
				// to each other
				setTimeout(function () {
					topic.child2.emit('someevent','somedata');
				}, 100);
			},
			'event received': function (msg) {
				assert.equal(msg,'somedata');
			}
		},
		', child can be stopped not affecting others':{
			topic: function (topic) {
				topic.child3.stop(this.callback.bind(topic,null,topic.child3));
			},
			'child3 stopped': function (hook) {
				assert.equal(hook.ready,false);
				assert.equal(hook.listening,false);
			}
		}				
	}
}).export(module);
