var vows = require('vows');
var assert = require('assert');
var Hook = require('hook.io').Hook;

vows.describe('Emitting event should use FIFO approach').addBatch({
	'2 clients':{
		topic:function () {
			var master = new Hook({name: 'master',local:false, silent:true});
			var cb = this.callback.bind(this, null,master);
			master.start();
			var child1 = new Hook({name: 'child1', silent:true});
			child1.start();
			master.on('hook::ready', function () {
				master.spawn([{src:'../testhook.js',name:'child2', silent:true}]);
			})
			master.on('child2::hook::ready', cb.bind(this,null,child1));
		},
		'started':function () {
		},
		'exchange messages': {
			topic:function(hook) {
				var count=10000;
				var ri = 0;
				var cb = this.callback;
				hook.on('child2::test_echo', function (i) {
					if (i!=ri) 
						cb(null, false);
					ri++;
					if (ri==count)
						cb(null,true);
				})
				for (var i=0; i<count; i++) {
					hook.emit('testcmd',{action:'echo',data:i});
				}
			},
			'should follow fifo approach':function(res) {
				assert.equal(true,res);
			}
		}
	}
}).export(module);
