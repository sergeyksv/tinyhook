var _=require('underscore');
var EventEmitter = require('eventemitter2').EventEmitter2;
var util = require ('util');
var nssocket = require('nssocket');

var Hook = function (options) {
	if (!options) options = {};
	
	// some options, name conversion close to hook.io
	this.name = this.name || options.name || options['hook-name'] || 'no-name';
	this.silent = this.silent || options.silent || true;
	this.local = this.local || options.local || false;
	this['hook-host'] = this['hook-host'] || options.host || options['hook-host'] || '127.0.0.1';
	this['hook-port'] = this['hook-port'] || options.port || options['hook-port'] || 1976;
	
	// some hookio flags that we support
	this.listening = false;
	this.ready = false;
	
	// default eventemitter options
	var EventEmitterProps = {
		delimiter: "::",
		wildcard: true
	};
	
	EventEmitter.call(this, EventEmitterProps);

	var self = this;
	var clients = {};
	var client = null;
	var uid = 1;
	var eventTypes = {};
	var server = null;
	
	// Function will attempt to start server, if it fails we assume that server already available
	// then it start in client mode. So first hook will became super hook, overs its clients
	this.start = function (options, cb) {
		options = options || {};
		if (typeof options === 'function') {
			if (cb==null) cb = options;
			options = {};
		}
		cb = cb || function () {};
		
		server = nssocket.createServer(function (socket) {
			// assign unique client id
			var cliId = uid; uid++;
			var client = {id:cliId, name: "hook_"+cliId, socket:socket, proxy:new EventEmitter(EventEmitterProps)};
			clients[cliId] = client;
			// ignore errors, close will happens in anyway
			socket.on('error', function () {
			})
			// clean context on client lost
			socket.on('close', function () {
				delete clients[cliId];
			})
			// almost dummy hello greeting
			socket.data('tinyhook::hello', function (d) {
				client.name = d.name;
			})
			// handle on and off to filter delivery of messages
			// everybody deliver to server, server filter and deliver to clients
			// we'll use proxy/stub of native EventEmitter2 to repeat behavior
			socket.data('tinyhook::on', function (d) {
				if (client.proxy.listeners(d.type).length==0) {
					client.proxy.on(d.type, function (data) {
						client.socket.send('tinyhook::pushemit', data);
					})
				}
				// synthesize newListener event 
				self.emit('hook::newListener',d.type,client.name);					
			})
			socket.data('tinyhook::off', function (d) {
				client.proxy.removeAllListeners(d.type);
			})
			// once we receive any event from child, deliver it to all clients
			// with smart filtering which is provided by EventEmitter2
			socket.data('tinyhook::emit', function (d) {
				d.event = client.name+"::"+d.event;
				_(clients).forEach(function (cli) {
					cli.proxy.emit(d.event,d);
				});
				// don't forget about ourselves
				EventEmitter.prototype.emit.apply(self,[d.event, d.data]);
			});
		});
		server.on('error', function (e) {
			server = null;
			if (e.code == 'EADDRINUSE')
				startClient(cb);
			else
				cb(e);
		})
		server.on('close', function (e) {
			server = null;
			self.listening = false;
			self.ready = false;
		})
		server.on('listening', function () {
			self.listening = true;
			self.ready = true;
			cb();
			EventEmitter.prototype.emit.apply(self,['hook::ready']);
		})
		server.listen(self['hook-port'], self['hook-host']);
	}
	
	// if server start fails we attempt to start in client mode
	function startClient(cb) {
		// since we using reconnect, will callback rightaway
		cb();
		client = new nssocket.NsSocket({reconnect:true});
		client.connect(self['hook-port'], self['hook-host']);
		// when connection started we sayng hello and push
		// all known event types we have
		client.on('start', function () {
			client.send(['tinyhook','hello'],{protoVersion:1,name:self.name});
			// purge known event types
			_(eventTypes).keys().forEach(function(type) {
				client.send(['tinyhook','on'],{type:type});
			});
			if (!self.ready) {
				// simulate hook:ready
				self.ready = true;
				self.emit('hook::ready');
			}
		});
		client.on('close', function() {
			self.ready = false;
			client = null;
		})
		// tranlate pushed emit to local one
		client.data('tinyhook::pushemit',function (d) {
			EventEmitter.prototype.emit.apply(self,[d.event,d.data]);
		});
		
		// every XX seconds do garbage collect and notify server about
		// event we longer not listening. Realtime notification is not necessary
		// Its ok if for some period we receive events that are not listened
		setInterval(function () {
			var newEventTypes;
			_(eventTypes).keys().forEach(function(type) {
				var listeners = self.listeners(type);
				if (listeners == null || listeners.length == 0) {
					// no more listerner for this event
					// push this to server
					client.send(['tinyhook','off'],{type:type});
					delete eventTypes[type];
				}
			});
		}, 60000);
	}
	
	// function to stop the hook
	this.stop = function (cb) {
		var cb = cb || function () {};
		if (server) {
			server.on('close',cb);
			server.close();
		} else if (client) {
			client.once('close',cb);
			client.end();
		} else cb();
	}
	
	// hook into core events to dispatch events as required
	this.emit = function (event,data,callback) {
		// on client send event to master
		if (client) {
			client.send(['tinyhook','emit'],{eid:uid++,event:event,data:data}, function () {});
		}
		// send to clients event emitted on server (master)
		if (server) {
			var d={event: this.name+"::"+event, data: data};
			_(clients).forEach(function (cli) {
				cli.proxy.emit(d.event,d);
			});
		}
		// still preserver local processing
		EventEmitter.prototype.emit.apply(self,arguments);
	}
	this.on = function (type, listener) {
		if (client) {
			client.send(['tinyhook','on'],{type:type}, function () {});
		};
		if (eventTypes)
			eventTypes[type]=1;
		EventEmitter.prototype.on.apply(self,[type, listener]);
	}
}

util.inherits(Hook, EventEmitter);
Hook.prototype.spawn = require('./spawn').spawn;
module.exports.Hook = Hook;
