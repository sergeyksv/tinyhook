var EventEmitter = require('eventemitter2').EventEmitter2;
var util = require('util');
var nssocket = require('nssocket');
var net = require('net');
var child_process = require("child_process");

exports.Hook = Hook;

var rootHook = null;

function Hook(options) {
    if (!options) options = {};

    // some options, name conversion close to hook.io
    this.name = this.name || options.name || options['hook-name'] || 'no-name';
    this.silent = JSON.parse(this.silent || options.silent || true);
    this.local = JSON.parse(this.local || options.local || false);
	this.fork = JSON.parse(this.fork || options.fork || true);
    this['hook-host'] = this['hook-host'] || options.host || options['hook-host'] || '127.0.0.1';
    this['hook-port'] = this['hook-port'] || options.port || options['hook-port'] || 1976;

    // some hookio flags that we support
    this.listening = false;
    this.ready = false;

    // default eventemitter options
    this.eventEmitter_Props = {
        delimiter: "::",
        wildcard: true,
		maxListeners: 20
    };

    EventEmitter.call(this, this.eventEmitter_Props);

    // semi-private props
    this._client = null;
    this._eventTypes = {};
    this._server = null;
    this._gcId = null;

	var self = this;
	self.on("*::hook::fork", function (fork) {
		// only master (listening hook) is allowed to fork
		if (!this.listening)
			return;
		function ForkAndBind() {
			var child = child_process.fork(fork.script, fork.params)
			function Client(name) {
				this.name = name;
				this._mtpl = {
					message:"tinyhook",
					name:name,
					data:{}
				}
			}

			Client.prototype.send = function (msg) {
				this._mtpl.data = msg;
				child.send(this._mtpl);
			};

			var clients = {};

			child.on("message", function (msg) {
				var client = clients[msg.name];
				if (client) {
					client(msg.data);
				} else if (msg.message == "tinyhook") {
					if (msg.data.message == "tinyhook::hello") {
						client = new Client(msg.name);
						// self.emit('child::start', hook.name, self.children[hook.name]);
						clients[msg.name] = self._serve(client);
					}
				}
			});

			child.on("exit", function (exitcode) {
				servefn({message:"tinyhook:bye"});
				self.emit('child::restart', hook.name, self.children[hook.name]);
				ForkAndBind();
			});
		}
		ForkAndBind();

	});

}
util.inherits(Hook, EventEmitter);
Hook.prototype.spawn = require('./spawn').spawn;

Hook.prototype.listen = function(options, cb) {
    // not sure which options can be passed, but lets
    // keep this for compatibility with original hook.io
    if (cb == null && options && options instanceof Function)
        cb = options;
    cb = cb || function() {};

    var self = this;

    var server = self._server = net.createServer();

    server.on("connection", function(socket) {
		console.log("connected");

        var client = {
            name: "hook",
            socket: socket,
			send : function (data) {
				var json = JSON.stringify(data);
				var length = 1000000000+json.length;
				socket.write(length.toString());
				socket.write(json);
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

		var packet = "";
        socket.on('data',function(data) {
			packet += data.toString();
			while (true) {
				if (packet.length<10)
					break;
				var len = parseInt(packet.substring(0,10))-1000000000;
				if (!(packet.length-10-len>=0))
				 	break;
				var body = packet.substring(10,10+len);
				packet=packet.substring(10+len);
	            var msg = JSON.parse(body);
				servefn(msg);
        	}
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
		console.log("listening");
        self.listening = true;
        self.ready = true;
        cb();
        // set callback to null, so we wan't ping it one more time in error handler
        cb = null;
		rootHook = self;
        EventEmitter.prototype.emit.apply(self, ['hook::ready']);
    });

    server.listen(self['hook-port'],self['hook-host']);
};

Hook.prototype.connect = function(options, cb) {
    // not sure which options can be passed, but lets
    // keep this for compatibility with original hook.io
    if (cb == null && options && options instanceof Function)
        cb = options;
    cb = cb || function() {};
    options = options || {
        reconnect: true
    };
    var self = this;

    // since we using reconnect, will callback rightaway
    cb();

    var client;

 	if (rootHook) {
		console.log(self.name,"Direct!")

		var lclient = {
			name: "hook",
			send: function (msg) {
				process.nextTick(function () {
					var d = msg.data;
					EventEmitter.prototype.emit.apply(self, [d.event, d.data]);
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
			client.send({
				message: 'tinyhook::hello',
				data: {
					protoVersion: 1,
					name: self.name
				}
			});
			Object.keys(self._eventTypes).forEach(function(type) {
				client.send({
					message: 'tinyhook::on',
					data: {
						type: type
					}
				});
			});

			if (!self.ready) {
				// simulate hook:ready
				self.ready = true;
				self.emit('hook::ready');
			}
		});
	} else if (this.fork) {
		console.log(self.name,"Forked!")

		this._client = client = new EventEmitter(self.eventEmitter_Props);

		client._mtpl = {
			message:"tinyhook",
			name:self.name,
			data:{}
		}

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
				EventEmitter.prototype.emit.apply(self, [d.event, d.data]);
			}
	    });

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

		if (!self.ready) {
			// simulate hook:ready
			self.ready = true;
			self.emit('hook::ready');
		}
	} else {
		console.log(self.name,"Socket!")

		client = this._client = net.connect(self['hook-port'],self['hook-host']);

		client.send = function (data) {
			var json = JSON.stringify(data);
			var length = 1000000000+json.length;
			this.write(length.toString());
			this.write(json);
		};

	    // when connection started we sayng hello and push
	    // all known event types we have
	    client.on('connect', function() {
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

	        if (!self.ready) {
	            // simulate hook:ready
	            self.ready = true;
	            self.emit('hook::ready');
	        }
	    });

	    // tranlate pushed emit to local one
		var packet = "";
		client.on('data',function(data) {
			packet += data.toString();
			while (true) {
				if (packet.length<10)
					break;
				var len = parseInt(packet.substring(0,10))-1000000000;
				if (!(packet.length-10-len>=0))
					break;
				var body = packet.substring(10,10+len);
				packet=packet.substring(10+len);
				var msg = JSON.parse(body);
				var d = msg.data;
	        	EventEmitter.prototype.emit.apply(self, [d.event, d.data]);
			}
	    });
	}

	self._client.on('close', function() {
		self.ready = false;
		client.destroy();
		client = self._client = null;
	})

    // every XX seconds do garbage collect and notify server about
    // event we longer not listening. Realtime notification is not necessary
    // Its ok if for some period we receive events that are not listened
    self._gcId = setInterval(function() {
        Object.keys(self._eventTypes).forEach(function(type) {
            var listeners = self.listeners(type);
            if (listeners == null || listeners.length == 0) {
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
    if (cb == null && options && options instanceof Function)
        cb = options;
    cb = cb || function() {};
    options = options || {};

    var self = this;

    this.listen(function(e) {
        if (e != null && (e.code == 'EADDRINUSE' || e.code == 'EADDRNOTAVAIL')) {
            // if server start fails we attempt to start in client mode
            self.connect(options, cb);
        } else {
            cb(e);
        }
    });
};

Hook.prototype.stop = function(cb) {
    cb = cb || function() {};
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
Hook.prototype.emit = function(event, data, callback) {
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
	    EventEmitter.prototype.emit.apply(this, [this.name + "::" + event, data]);
    }

    // still preserve local processing
    EventEmitter.prototype.emit.apply(this, arguments);
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
    EventEmitter.prototype.on.apply(this, arguments);
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
	            self.emit('hook::newListener', d.type, client.name);
	            break;
	        case 'tinyhook::off':
	            self.off(d.type, handler);
	            break;
			case 'tinyhook::bye':
	            self.off('**', handler);
	            break;
	        case 'tinyhook::emit':
	            EventEmitter.prototype.emit.apply(self, [client.name + "::" + d.event, d.data]);
	            break;
	    }
	};
};
