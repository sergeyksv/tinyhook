var EventEmitter = require('eventemitter2').EventEmitter2;
var util = require('util');
var net = require('net');
var child_process = require("child_process");
var async  = require('async');
var path = require('path');
var fs = require('fs');
var existsSync = fs.existsSync || path.existsSync;

exports.Hook = Hook;

var roots = [];

function Hook(options) {
	if (!options) options = {};

	// some options, name conversion close to hook.io
	this.name = this.name || options.name || options['hook-name'] || 'no-name';
	this.silent = JSON.parse(this.silent || options.silent || true);
	this.local = JSON.parse(this.local || options.local || false);
	this._hookMode = options.mode || options['hook-mode'] || "netsocket";
	this['hook-host'] = this['hook-host'] || options.host || options['hook-host'] || '127.0.0.1';
	this['hook-port'] = this['hook-port'] || options.port || options['hook-port'] || 1976;

	// some hookio flags that we support
	this.listening = false;
	this.ready = false;

	// default eventemitter options
	this.eventEmitter_Props = {
		delimiter: "::",
		wildcard: true,
		maxListeners: 100,
// wildcardCache: true
	};

	EventEmitter.call(this, this.eventEmitter_Props);

	// semi-private props
	this._client = null;
	this._eventTypes = {};
	this._server = null;
	this._gcId = null;
	this._connectCount = 0;

	var self = this;
	self.on("*::hook::fork", function (fork) {

		// only master (listening hook) is allowed to fork
		if (!this.listening)
			return;

		var children = {};

		// we taking care on our childeren and stop them when we exit
		process.on('exit', function () {
			for (var pid in children) {
				children[pid].kill();
			}
		});

		function ForkAndBind() {
			var start = new Date().valueOf();
			var restartCount = 0;

			var child = child_process.fork(fork.script, fork.params);

			self.emit('hook::fork-start', {name:fork.name, pid:child.pid} );

			children[child.pid] = child;
			function Client(name) {
				this.name = name;
				this._mtpl = {
					message:"tinyhook",
					name:name,
					data:{}
				};
			}

			Client.prototype.send = function (msg) {
				this._mtpl.data = msg;
				if (child) child.send(this._mtpl);
			};

			var clients = {};

			child.on("message", function (msg) {
				var client = clients[msg.name];
				if (client) {
					client(msg.data);
				} else if (msg.message == "tinyhook") {
					if (msg.data.message == "tinyhook::hello") {
						client = new Client(msg.name);
						clients[msg.name] = self._serve(client);
					}
				}
			});

			child.on("exit", function (exitcode) {
				delete children[child.pid];
				// when process die all hooks have to say goodbye
				async.each(clients, function (client, cb) {
					alive = true;
					child = null;
					client({message:"tinyhook:bye"});
					cb();
				}, function () {
					self.emit('hook::fork-exit', {name:fork.name, exitcode:exitcode} );
					// abnormal termination
					if (exitcode!==0) {
						var lifet = 0.0001*(new Date().valueOf() - start);
						// looks like recoverable error, lets restart
						setTimeout(ForkAndBind,Math.round(restartCount/lifet));
					}
				});
			});
		}
		ForkAndBind();

	});

}
util.inherits(Hook, EventEmitter);

Hook.prototype.listen = function(options, cb) {
	// not sure which options can be passed, but lets
	// keep this for compatibility with original hook.io
	if (!cb && options && options instanceof Function)
		cb = options;
	cb = cb || function() {};

	var self = this;

	var server = self._server = net.createServer();

	server.on("connection", function(socket) {
		var client = {
			name: "hook",
			socket: socket,
			send : function (data) {
				var lbuffer = new Buffer(4);
				var buffer= new Buffer(JSON.stringify(data));
				lbuffer.writeUInt32BE(buffer.length,0);
				socket.write(lbuffer);
				socket.write(buffer);
			}
		};

		// ignore errors, close will happens in anyway
		socket.on('error', function(err) {});

		// properly shutdown connection
		var servefn = self._serve(client);

		// clean context on client lost
		socket.on('close', function() {
			servefn({message:"tinyhook::bye"});
		});

		var packets = [];
		var len = 0, elen = 4, state=0;
		socket.on('data',function(data) {
			len += data.length;
			var edata;
			while (len>=elen) {
				if (packets.length) {
					packets.push(data);
					data = Buffer.concat(packets, len);
					packets = [];
				}
				edata = data.slice(0,elen);
				len = len-elen;
				if (len>0) {
					data = data.slice(-len);
				}
				switch (state) {
					case 0:
						elen = edata.readUInt32BE(0);
						state=1;
						break;
					case 1:
						var d = JSON.parse(edata.toString());
						state = 0; elen = 4;
						servefn(d);
				}
			}
			if (len)
				packets.push(data);
		});
	});

	server.on('error', function(e) {
		server = self._server = null;
		// here cb can be null, if we start listening and error happens after that
		if (cb)
			cb(e);
	});

	server.on('close', function(e) {
		server = self._server = null;
		self.listening = false;
		self.ready = false;
	});

	server.on('listening', function() {
		self.listening = true;
		self.ready = true;
		roots[self['hook-port']] = self;
		cb();
		// set callback to null, so we wan't ping it one more time in error handler
		cb = null;
		EventEmitter.prototype.emit.call(self, 'hook::ready');
	});

	server.listen(self['hook-port'],self['hook-host']);
};

Hook.prototype.connect = function(options, cb) {
	// not sure which options can be passed, but lets
	// keep this for compatibility with original hook.io
	if (!cb && options && options instanceof Function)
		cb = options;
	cb = cb || function() {};
	options = options || {
		reconnect: true
	};
	var self = this;

	// since we using reconnect, will callback rightaway
	cb();

	var client;

	var rootHook = roots[self['hook-port']];
	if (rootHook && (self.local || self._hookMode == "direct" || self._hookMode == "fork")) {
		self._hookMode = "direct";
		var lclient = {
			name: "hook",
			send: function (msg) {
				process.nextTick(function () {
					var d = msg.data;
					EventEmitter.prototype.emit.call(self, d.event, d.data);
				});
			}
		};

		var servefn = rootHook._serve(lclient);
		this._client = client = new EventEmitter(self.eventEmitter_Props);
		client.send = function (msg) {
			servefn(msg);
		};
		client.end = function () {
			this.emit("close");
		};
		client.destroy = function () {
			this.removeAllListeners();
		};

		// purge known event types
		process.nextTick(function () {
			self._clientStart(client);
			self._hookMode = "direct";
		});
	}
	// fork mode is only possible if hook is launched using child_process.fork
	else if (self._hookMode == "fork" && process.send) {
		this._client = client = new EventEmitter(self.eventEmitter_Props);

		client._mtpl = {
			message:"tinyhook",
			name:self.name,
			data:{}
		};

		client.send = function (msg) {
			this._mtpl.data = msg;
			process.send(this._mtpl);
		};
		client.end = function () {
			this.emit("close");
		};
		client.destroy = function () {
			this.removeAllListeners();
		};

		process.on('message',function(msg) {
			if (msg.message == "tinyhook" && msg.name == self.name) {
				var d = msg.data.data;
				EventEmitter.prototype.emit.call(self, d.event, d.data);
			}
		});

		self._clientStart(client);

	} else {
		self._hookMode = "netsocket";

		client = this._client = net.connect(self['hook-port'],self['hook-host']);

		client.send = function (data) {
			var lbuffer = new Buffer(4);
			var buffer= new Buffer(JSON.stringify(data));
			lbuffer.writeUInt32BE(buffer.length,0);
			client.write(lbuffer);
			client.write(buffer);
		};

		// when connection started we sayng hello and push
		// all known event types we have
		client.on('connect', function() {
			self._clientStart(client);
		});

		// any error will terminate connection
		client.on('error', function() {
			client.end();
		})

		// tranlate pushed emit to local one
		var packets = [];
		var len = 0, elen = 4, state=0;
		client.on('data',function(data) {
			len += data.length;
			var edata;
			while (len>=elen) {
				if (packets.length) {
					packets.push(data);
					data = Buffer.concat(packets, len);
					packets = [];
				}
				edata = data.slice(0,elen);
				len = len-elen;
				if (len>0) {
					data = data.slice(-len);
				}
				switch (state) {
					case 0:
						elen = edata.readUInt32BE(0);
						state=1;
						break;
					case 1:
						var d = JSON.parse(edata.toString()).data;
						state = 0; elen = 4;
						EventEmitter.prototype.emit.call(self, d.event, d.data);
				}
			}
			if (len)
				packets.push(data);
		});
	}

	self._client.on('close', function() {
		client.destroy();
		client = self._client = null;
		if (options.reconnect) {
			self.connectCount++;
			var reconnectFn = function () {
				if (!self.ready)
					return;
				self.connect(options, function (err) {
					if (err) {
						setTimeout(reconnectFn,10*self.connectCount*self.connectCount);
					} else {
						self.connectCount = 1;
					}
				})
			}();
		} else {
			self.ready = false;
		}
	});

	// every XX seconds do garbage collect and notify server about
	// event we longer not listening. Realtime notification is not necessary
	// Its ok if for some period we receive events that are not listened
	self._gcId = setInterval(function() {
		Object.keys(self._eventTypes).forEach(function(type) {
			var listeners = self.listeners(type);
			if (!listeners || !listeners.length) {
				// no more listener for this event
				// push this to server
				client.send({message:'tinyhook::off', data: {
					type: type
				}});
				delete self._eventTypes[type];
			}
		});
	}, 60000);
};

// Function will attempt to start server, if it fails we assume that server already available
// then it start in client mode. So first hook will became super hook, overs its clients
Hook.prototype.start = function(options, cb) {
	// not sure which options can be passed, but lets
	// keep this for compatibility with original hook.io
	if (!cb && options && options instanceof Function)
		cb = options;
	cb = cb || function() {};
	options = options || {};

	var self = this;

	this.listen(function(e) {
		if (e && (e.code == 'EADDRINUSE' || e.code == 'EADDRNOTAVAIL')) {
			// if server start fails we attempt to start in client mode
			self.connect(options, cb);
		} else {
			cb(e);
		}
	});
};

Hook.prototype.stop = function(cb) {
	cb = cb || function() {};
	this.ready = false;
	if (this._server) {
		this._server.on('close', cb);
		this._server.close();
	} else if (this._client) {
		if (this._gcId) {
			clearInterval(this._gcId);
			this._gcId = null;
		}
		this._client.once('close', cb);
		this._client.end();
	} else {
		cb();
	}
};

// hook into core events to dispatch events as required
Hook.prototype.emit = function(event, data, cb) {
	// on client send event to master
	if (this._client) {
		this._client.send({ message: 'tinyhook::emit',
			data: {
				event: event,
				data: data
			}
		});
	} else if (this._server) {
		// send to clients event emitted on server (master)
		EventEmitter.prototype.emit.call(this, this.name + "::" + event, data);
	}

	// still preserve local processing
	EventEmitter.prototype.emit.call(this, event, data, cb);
};

Hook.prototype.on = function(type, listener) {
	if (!this._eventTypes[type] && this._client) {
		this._client.send({
				message: 'tinyhook::on',
				data: {
					type: type
				}
			},
			function() {});
	}
	if (this._eventTypes) {
		this._eventTypes[type] = 1;
	}
	EventEmitter.prototype.on.call(this, type, listener);
};

Hook.prototype._clientStart = function (client) {
	var self=this;
	client.send({
		message: 'tinyhook::hello',
		data: {
			protoVersion: 1,
			name: self.name
		}
	});

	// purge known event types
	Object.keys(self._eventTypes).forEach(function(type) {
		client.send({
			message: 'tinyhook::on',
			data: {
				type: type
			}
		});
	});

	// lets use echo to get ready status when all the above is processed
	self.once("hook::ready-internal", function () {
		var readyevent = self.ready?"hook::reconnected":"hook::ready";
		self.ready = true;
		self.emit(readyevent);
	})
	client.send({
		message: 'tinyhook::echo',
		data: {
			event: 'hook::ready-internal'
		}
	});
};

Hook.prototype._serve = function (client) {
	var self = this;
	function handler(data) {
		client.send({
			message: 'tinyhook::pushemit',
			data: {event:self.event,data:data}
		});
	}
	return function (msg) {
		var d = msg.data;
		switch (msg.message) {
			case 'tinyhook::hello':
				client.name = d.name;
				break;
			case 'tinyhook::on':
				self.on(d.type, handler);
				self.emit('hook::newListener', {type:d.type, hook:client.name});
				break;
			case 'tinyhook::echo':
				client.send({
					message: 'tinyhook::pushemit',
					data: {event:d.event,data:d.data}
				});
				break;
			case 'tinyhook::off':
				self.off(d.type, handler);
				break;
			case 'tinyhook::bye':
				self.off('**', handler);
				break;
			case 'tinyhook::emit':
				EventEmitter.prototype.emit.call(self, client.name + "::" + d.event, d.data);
				break;
		}
	};
};

Hook.prototype.spawn = function (hooks, cb) {
	var self = this,
		connections = 0,
		local,
		names;
	cb = cb || function () {};

	if (!self.children)
		self.children=[];

	if (!this.ready)
		return cb(new Error('Cannot spawn child hooks without being ready'));

	if (typeof hooks === "string")
		hooks = new Array(hooks);

	types = {};

	local = self.local || false;

	function cliOptions(options) {
		var cli = [];

		var reserved_cli = ['port', 'host', 'name', 'type'];

		Object.keys(options).forEach(function (key) {
			var value = options[key];

			if (typeof value === 'object') {
			  value = JSON.stringify(value);
			}

			//
			// TODO: Some type inspection to ensure that only
			// literal values are accepted here.
			//
			if (reserved_cli.indexOf(key) === -1) {
				cli.push('--' + key, value);
			} else {
				cli.push('--hook-' + key, value);
			}
		});

		return cli;
	}


	function spawnHook (hook, next) {
		var hookPath,
			hookBin = __dirname + '/bin/forever-shim',
			options,
			child,
			keys;

		hook.host = hook.host || self['hook-host'];
		hook.port = hook.port || self['hook-port'];

		if (hook.src) {
			// 1'st guess, this is path to file or module, i.e. just existent path
			hookPath = path.resolve(hook.src);
			if (!existsSync(hookPath)) {
				// 2'nd guess, process module?
				hookPath = process.cwd() + '/node_modules/' + hook.src;
				if (!existsSync(hookPath)) {
					// 3'nd guess, no idea, let require to resoolve it
					hookPath = hook.src;
				}
			}
		}

		self.emit('hook::spawning', hook.name);

		if (local) {
			self.children[hook.name] = {
				module: require(hookPath)
			};

			//
			// Here we assume that the `module.exports` of any given `hook.io-*` module
			// has **exactly** one key. We extract this Hook prototype and instantiate it.
			//
			keys = Object.keys(self.children[hook.name].module);
			var mysun = self.children[hook.name];
			mysun.Hook  = mysun.module[keys[0]];
			mysun._hook = new (mysun.Hook)(hook);
			mysun._hook.start();

			//
			// When the hook has fired the `hook::ready` event then continue.
			//
			mysun._hook.once('hook::ready', next.bind(null, null));
		} else {
			self.emit("hook::fork",{script:hookBin, name: hook.name, params:cliOptions(hook)});
		}
		self.once(hook.name+'::hook::ready', function () {
			connections++;
			if (connections === hooks.length) {
				self.emit('hook::children-ready', hooks);
			}
		});
	}

	async.forEach(hooks, spawnHook, function (err) {
		if (!err)
			self.emit('hook::children-spawned', hooks);
		cb(err);
	});

	return this;
};
