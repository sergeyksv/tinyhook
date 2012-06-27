var EventEmitter = require('eventemitter2').EventEmitter2;
var util = require('util');
var nssocket = require('nssocket');

exports.Hook = Hook;

function Hook(options) {
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
  this.eventEmitter_Props = {
    delimiter: "::",
    wildcard: true
  };
  
  EventEmitter.call(this, this.eventEmitter_Props);
  
  // semi-private props
  this._clients = [];
  this._client = null;
  this._uid = 1;
  this._eventTypes = {};
  this._server = null;
  
}
util.inherits(Hook, EventEmitter);
Hook.prototype.spawn = require('./spawn').spawn;

Hook.prototype.listen = function(options, cb) {
  // not sure which options can be passed, but lets
  // keep this for compatibility with original hook.io
  if (cb==null && options && options instanceof Function )
    cb = options;
  cb = cb || function () {};
	
  var self = this;
  
  var server = self._server = nssocket.createServer(function (socket) {
    // assign unique client id
    var cliId = self._uid += 1;
    
    var client = {
      id: cliId,
      name: "hook_"+cliId,
      socket: socket,
      proxy: new EventEmitter(self.eventEmitter_Props)
    };
    self._clients.push(client);
    
    // ignore errors, close will happens in anyway
    socket.on('error', function (err) {
    });
    
    // properly shutdown connection
    function destroy() {
		// forget this client
		for (var i=0; i<self._clients.length; i++) {
			if (self._clients[i].id==cliId) {
				self._clients.splice(i,1);
				// shutdown proxy and nssocket
				client.proxy.removeAllListeners();
				client.socket.destroy();
				break;
			}
		}
	}
    
    // clean context on client lost
    socket.on('close', function () {
		destroy();
    });
    
    // almost dummy hello greeting
    socket.data('tinyhook::hello', function (d) {
      client.name = d.name;
    });
    
    // handle on and off to filter delivery of messages
    // everybody deliver to server, server filter and deliver to clients
    // we'll use proxy/stub of native EventEmitter2 to repeat behavior
    socket.data('tinyhook::on', function (d) {
      if (client.proxy.listeners(d.type).length == 0) {
        client.proxy.on(d.type, function (data) {
		  try {
			client.socket.send('tinyhook::pushemit', data);
	      } catch (e) {
			// both we and nssocket has a function that should prevent
			// this happening, but probably died/corrupted sockets can't 
			// be detected by sockets error and close event and this can happens
			destroy();
		  }
        })
      }
      
      // synthesize newListener event 
      self.emit('hook::newListener', d.type, client.name);          
    });
    
    socket.data('tinyhook::off', function (d) {
      client.proxy.removeAllListeners(d.type);
    });
    
    // once we receive any event from child, deliver it to all clients
    // with smart filtering which is provided by EventEmitter2
    socket.data('tinyhook::emit', function (d) {
      d.event = client.name+"::"+d.event;
      self._clients.forEach(function (cli) {
        cli.proxy.emit(d.event, d);
      });
      
      // don't forget about ourselves
      EventEmitter.prototype.emit.apply(self, [d.event, d.data]);
    });
  });
  
  server.on('error', function (e) {
    server = self._server = null;
    // here cb can be null, if we start listening and error happens after that
    if (cb)
		cb(e);
  });
  
  server.on('close', function (e) {
    server = self._server = null;
    self.listening = false;
    self.ready = false;
  });
  
  server.on('listening', function () {
    self.listening = true;
    self.ready = true;
    cb(); 
    // set callback to null, so we wan't ping it one more time in error handler
    cb = null;
    EventEmitter.prototype.emit.apply(self, ['hook::ready']);
  });
  
  server.listen(self['hook-port'], self['hook-host']);
};

Hook.prototype.connect = function(options, cb) {
  // not sure which options can be passed, but lets
  // keep this for compatibility with original hook.io
  if (cb==null && options && options instanceof Function )
    cb = options;
  cb = cb || function () {};
  options = options|| {};
  var self = this;
  
  // since we using reconnect, will callback rightaway
  cb();
  
  var client = this._client = new nssocket.NsSocket({reconnect: options.reconnect});
  client.connect(self['hook-port'], self['hook-host']);
  
  // when connection started we sayng hello and push
  // all known event types we have
  client.on('start', function () {
    client.send(['tinyhook', 'hello'], {protoVersion: 1, name: self.name});
    
    // purge known event types
    Object.keys(self._eventTypes).forEach(function(type) {
      client.send(['tinyhook', 'on'], {type: type});
    });
    
    if (!self.ready) {
      // simulate hook:ready
      self.ready = true;
      self.emit('hook::ready');
    }
  });
  
  client.on('close', function() {
    self.ready = false;
    client = self._client = null;
  })
  
  // tranlate pushed emit to local one
  client.data('tinyhook::pushemit',function (d) {
    EventEmitter.prototype.emit.apply(self, [d.event, d.data]);
  });
  
  // every XX seconds do garbage collect and notify server about
  // event we longer not listening. Realtime notification is not necessary
  // Its ok if for some period we receive events that are not listened
  self.gcId = setInterval(function () {
    Object.keys(self._eventTypes).forEach(function(type) {
      var listeners = self.listeners(type);
      if (listeners == null || listeners.length == 0) {
        // no more listener for this event
        // push this to server
        client.send(['tinyhook','off'],{type:type});
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
  if (cb==null && options && options instanceof Function )
    cb = options;
  cb = cb || function () {};
  options = options || {};
  	
  var self = this;

  this.listen(function(e) {
    if (e!=null && (e.code == 'EADDRINUSE' || e.code == 'EADDRNOTAVAIL')) {
      // if server start fails we attempt to start in client mode
      self.connect(options, cb);
    } else {
      cb(e);
    }
  });
};

Hook.prototype.stop = function(cb) {
  cb = cb || function () {};
  if (this._server) {
    this._server.on('close',cb);
    this._server.close();
  } else if (this._client) {
    clearInterval(this.gcId);
    this._client.once('close',cb);
    this._client.destroy();
  } else {
    cb();
  }
};

// hook into core events to dispatch events as required
Hook.prototype.emit = function(event, data, callback) {
  // on client send event to master
  if (this._client) {
    this._client.send(['tinyhook', 'emit'], {eid: this._uid++, event: event, data: data}, function () {});
  }
  // send to clients event emitted on server (master)
  if (this._server) {
    var d = {event: this.name+"::"+event, data: data};
    this._clients.forEach(function (cli) {
      cli.proxy.emit(d.event, d);
    });
  }
  // still preserve local processing
  EventEmitter.prototype.emit.apply(this, arguments);
};

Hook.prototype.on = function(type, listener) {
  if (this._client) {
    this._client.send(['tinyhook', 'on'], {type: type}, function () {});
  }
  if (this._eventTypes) {
    this._eventTypes[type] = 1;
  }
  EventEmitter.prototype.on.apply(this, arguments);
};
