"use strict";

const { EventEmitter2: EventEmitter } = require('eventemitter2');
const net = require('net');
const child_process = require("child_process");
const safe = require('safe');
const path = require('path');
const fs = require('fs');
const BufferConverter = require("./lib/BufferConverter.js");
const existsSync = fs.existsSync || path.existsSync;

// hook into core events to dispatch events as required
const bufferConverter = new BufferConverter();

const TINY_MESSAGES = Object.freeze({
	HELLO: 1,
	ON: 2,
	ECHO: 3,
	OFF: 4,
	BYE: 5,
	EMIT: 6,
	PUSH_EMIT: 7
});

const roots = [];

class Hook extends EventEmitter {
	constructor(options) {
		if (!options)
			options = {};

		// default eventemitter options
		const eventEmitter_Props = {
			delimiter: "::",
			wildcard: true,
			maxListeners: 100
			// wildcardCache: true
		};

		super(eventEmitter_Props);

		this.eventEmitter_Props = eventEmitter_Props;

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

		// semi-private props
		this._client = null;
		this._eventTypes = {};
		this._server = null;
		this._remoteEvents = null;
		this._gcId = null;
		this._connectCount = 0;
		this.children = null;
		this.childrenSpawn = null;
		this.on("*::hook::fork", hookFork);

	}

	listen(options, cb) {
		// not sure which options can be passed, but lets
		// keep this for compatibility with original hook.io
		if (!cb && options && options instanceof Function)
			cb = options;
		cb = cb || (() => { });

		let server = this._server = net.createServer();
		this._remoteEvents = new EventEmitter(this.eventEmitter_Props);

		const serverConnection = (socket) => {
			const _bufferConverter = new BufferConverter();
			const client = {
				name: "hook",
				socket,
				send(message, data) {
					socket.write(_bufferConverter.serializeNormal(message, data));
				}
			};

			// ignore errors, close will happens in anyway
			socket.on('error', err => { });

			// properly shutdown connection
			const servefn = this._serve(client);

			// clean context on client lost
			socket.on('close', () => {
				servefn({ message: TINY_MESSAGES.BYE });
			});

			_bufferConverter.onDone = servefn;
			socket.on('data', chunk => {
				_bufferConverter.takeChunk(chunk);
			});
		};

		const serverError = (e) => {
			server = this._server = null;
			// here cb can be null, if we start listening and error happens after that
			if (cb)
				cb(e);
		};

		const serverClose = () => {
			server = this._server = null;
			this.listening = false;
			this.ready = false;
		};

		const serverListening = () => {
			this.listening = true;
			this.ready = true;
			roots[this['hook-port']] = this;
			cb();
			// set callback to null, so we wan't ping it one more time in error handler
			cb = null;
			EventEmitter.prototype.emit.call(this, 'hook::ready');
		};

		server.on("connection", serverConnection);
		server.on('error', serverError);
		server.on('close', serverClose);
		server.on('listening', serverListening);
		server.listen(this['hook-port'], this['hook-host']);
	}

	connect(options, cb) {
		// not sure which options can be passed, but lets
		// keep this for compatibility with original hook.io
		if (!cb && options && options instanceof Function)
			cb = options;
		cb = cb || (() => { });
		options = options || {
			reconnect: true
		};

		// since we using reconnect, will callback rightaway
		cb();

		let client;

		const rootHook = roots[this['hook-port']];
		if (rootHook && (this.local || this._hookMode === "direct" || this._hookMode === "fork")) {
			this._hookMode = "direct";
			const lclient = {
				name: "hook",
				send: (msg, data) => {
					process.nextTick(() => {
						EventEmitter.prototype.emit.call(this, msg.type, data);
					});
				}
			};

			const servefn = rootHook._serve(lclient);
			this._client = client = new EventEmitter(this.eventEmitter_Props);
			client.send = (msg, data) => {
				servefn(msg, data);
			};
			client.end = function () {
				this.emit("close");
			};
			client.destroy = function () {
				this.removeAllListeners();
			};

			// purge known event types
			process.nextTick(() => {
				this._clientStart(client);
				this._hookMode = "direct";
			});
		}
		// fork mode is only possible if hook is launched using child_process.fork
		else if (this._hookMode === "fork" && process.send) {
			this._client = client = new EventEmitter(this.eventEmitter_Props);

			client._mtpl = {
				message: "tinyhook",
				name: this.name,
				msg: undefined,
				data: undefined
			};

			client.send = function (msg, data) {
				this._mtpl.msg = msg;
				this._mtpl.data = data;
				process.send(this._mtpl);
			};
			client.end = function () {
				this.emit("close");
			};
			client.destroy = function () {
				this.removeAllListeners();
			};

			process.on('message', msg => {
				if (msg.message === "tinyhook" && msg.name === this.name) {
					EventEmitter.prototype.emit.call(this, msg.msg.type, msg.data);
				}
			});

			this._clientStart(client);
		} else {
			this._hookMode = "netsocket";

			const _bufferConverter = new BufferConverter();

			client = this._client = net.connect(this['hook-port'], this['hook-host']);
			client.send = (message, data) => {
				client.write(_bufferConverter.serializeNormal(message, data));
			};

			// when connection started we sayng hello and push
			// all known event types we have
			client.on('connect', () => {
				this._clientStart(client);
			});

			// any error will terminate connection
			client.on('error', () => {
				client.end();
			});

			// tranlate pushed emit to local one
			_bufferConverter.onDone = (message, data) => {
				EventEmitter.prototype.emit.call(this, message.type, data ? JSON.parse(data.toString()) : undefined);
			};
			client.on('data', chunk => {
				_bufferConverter.takeChunk(chunk);
			});
		}

		this._client.on('close', () => {
			client.destroy();
			client = this._client = null;
			if (options.reconnect) {
				this.connectCount++;
				const reconnectFn = (() => {
					if (!this.ready)
						return;

					this.connect(options, err => {
						if (err) {
							setTimeout(reconnectFn, 10 * this.connectCount * this.connectCount);
						} else {
							this.connectCount = 1;
						}
					});
				})();
			} else {
				this.ready = false;
			}
		});

		// every XX seconds do garbage collect and notify server about
		// event we longer not listening. Realtime notification is not necessary
		// Its ok if for some period we receive events that are not listened
		this._gcId = setInterval(() => {
			if (!client) // maybe disconneted?
				return;

			Object.keys(this._eventTypes).forEach(type => {
				const listeners = this.listeners(type);
				if (!listeners || !listeners.length) {
					// no more listener for this event
					// push this to server
					client.send({
						message: TINY_MESSAGES.OFF,
						type
					});
					delete this._eventTypes[type];
				}
			});
		}, 60000);
	}

	// Function will attempt to start server, if it fails we assume that server already available
	// then it start in client mode. So first hook will became super hook, overs its clients
	start(options, cb) {
		// not sure which options can be passed, but lets
		// keep this for compatibility with original hook.io
		if (!cb && options && options instanceof Function)
			cb = options;
		cb = cb || (() => { });
		options = options || {};

		this.listen(e => {
			if (e && (e.code === 'EADDRINUSE' || e.code === 'EADDRNOTAVAIL')) {
				// if server start fails we attempt to start in client mode
				this.connect(options, cb);
			} else {
				cb(e);
			}
		});
	}

	stop(cb = () => { }) {
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
	}

	emit(event, data, cb) {
		// on client send event to master
		if (this._client) {
			this._client.send({
				message: TINY_MESSAGES.EMIT,
				type: event
			}, data);
		} else if (this._server) {
			// send to clients event emitted on server (master)
			this._chieldEmit(`${this.name}::${event}`, data);
		}

		// still preserve local processing
		super.emit(event, data, cb);
	}

	on(type, listener) {
		if (!this._eventTypes[type] && this._client) {
			this._client.send({
				message: TINY_MESSAGES.ON,
				type
			});
		}
		if (this._eventTypes) {
			this._eventTypes[type] = 1;
		}
		super.on(type, listener);
	}

	once(type, listener) {
		if (!this._eventTypes[type] && this._client) {
			this._client.send({
				message: TINY_MESSAGES.ONCE,
				type
			});
		}
		if (this._eventTypes) {
			this._eventTypes[type] = 1;
		}
		super.once(type, listener);
	}

	/**
	 * This function allows to listen on specific event and with additional
	 * filtering support. This can be useful for load ballancing when two
	 * hooks will process same data but each need to process its own portion
	 *
	 * @param {String} type Event type
	 * @param {String} selValue Ballance selector value
	 * @param {String} filterId Globally unique id for this filter
	 * @param {Object} fnFilter Ballance selector emmiter function
	 * @param type - should be clear cmd without ::
	 */
	onFilter(type, selValue, filterId, fnFilter, listener) {
		if (this._client) {
			const btype = type + filterId + selValue;
			if (this._eventTypes[btype])
				throw new Error("Only one listener per unique (filterId+setValue) is allowed");
			this._client.send({
				message: TINY_MESSAGES.ON,
				type: btype,
				ballancer: {
					origType: type,
					filterId,
					selValue,
					fnFilter: fnFilter.toString().match(/function[^{]+\{([\s\S]*)\}$/)[1]
				}
			});
			super.on(btype, listener);
		}
		function proxy(obj) {
			if (selValue == fnFilter(obj))
				listener(obj);
		}
		proxy._origin = listener;
		super.on(type, proxy);
	}

	_clientStart(client) {
		client.send({
			message: TINY_MESSAGES.HELLO,
			protoVersion: 3,
			name: this.name
		});

		// purge known event types
		Object.keys(this._eventTypes).forEach(type => {
			client.send({
				message: TINY_MESSAGES.ON,
				type
			});
		});

		// lets use echo to get ready status when all the above is processed
		this.once("hook::ready-internal", () => {
			const readyevent = this.ready ? "hook::reconnected" : "hook::ready";
			this.ready = true;
			this.emit(readyevent);
		});

		client.send({
			message: TINY_MESSAGES.ECHO,
			type: 'hook::ready-internal'
		});
	}

	_serve(client) {
		let lhook = this;
		let handler = null;
		const serviceEvents = {};

		function handlerLegacy(data) {
			client.send({
				message: TINY_MESSAGES.PUSH_EMIT,
				type: this.event
			}, data);
		}

		function handlerSocket(bufferFn) {
			client.socket.write(bufferFn());
		}

		if (client.socket) {
			lhook = this._remoteEvents;
			handler = handlerSocket;
		} else {
			lhook = this;
			handler = handlerLegacy;
		}

		return (msg, data) => {
			switch (msg.message) {
				case TINY_MESSAGES.HELLO:
					client.name = msg.name;
					break;
				case TINY_MESSAGES.ON:
				case TINY_MESSAGES.ONCE:
					lhook.on(msg.type, handler);
					if (msg.ballancer) {
						const fnFilter = new Function("obj", msg.ballancer.fnFilter);
						fnFilter._origin = handler;
						const serviceHanlder = (obj) => {
							// send ballanced event only if main event is not sending already
							if (lhook.listeners(msg.type).length == 0) {
								if (fnFilter(obj) == msg.ballancer.selValue) {
									this._chieldEmit(msg.type, obj);
								}
							}
						};
						serviceEvents[msg.type] = { handler: serviceHanlder, type: msg.ballancer.origType };
						this.on(msg.ballancer.origType, serviceHanlder);
					}
					this.emit('hook::newListener', {
						type: msg.type,
						hook: client.name
					});
					break;
				case TINY_MESSAGES.ECHO:
					client.send({
						message: TINY_MESSAGES.PUSH_EMIT,
						type: msg.type
					});
					break;
				case TINY_MESSAGES.OFF:
					lhook.off(msg.type, handler);
					if (serviceEvents[msg.type]) {
						this.off(serviceEvents[msg.type].type, serviceEvents[msg.type].handler);
						delete serviceEvents[msg.type];
					}
					break;
				case TINY_MESSAGES.BYE:
					lhook.off('**', handler);
					// need to cleanup service events (if any)
					for (const evt of Object.keys(serviceEvents)) {
						this.off(serviceEvents[evt].type, serviceEvents[evt].handler);
					}
					break;
				case TINY_MESSAGES.EMIT:
					const t = `${client.name}::${msg.type}`;

					if (client.socket) {
						// emit locally only if there are listeners, this is to no deserialize if this is not required
						if (this.listeners(t).length || this.listenersAny().length)
							EventEmitter.prototype.emit.call(this, t, data ? JSON.parse(data.toString()) : undefined);

						// translate / pass this to child hooks
						let cachedBuffer = null;
						this._remoteEvents.emit(t, () => {
							if (!cachedBuffer) {
								cachedBuffer = bufferConverter.serializeFast({
									message: TINY_MESSAGES.PUSH_EMIT,
									type: t
								}, data);
							}
							return cachedBuffer;
						});
					} else {
						this._chieldEmit(t, data);
					}

					break;
			}
		};
	}

	spawn(hooks, cb) {
		let connections = 0;
		let local;

		cb = cb || (() => { });

		if (!this.childrenSpawn)
			this.childrenSpawn = {};

		if (!this.ready)
			return cb(new Error('Cannot spawn child hooks without being ready'));

		if (typeof hooks === "string")
			hooks = new Array(hooks);

		local = this.local || false;

		function cliOptions(options) {
			const cli = [];

			const reserved_cli = ['port', 'host', 'name', 'type'];

			Object.keys(options).forEach(key => {
				let value = options[key];

				if (typeof value === 'object') {
					value = JSON.stringify(value);
				}

				//
				// TODO: Some type inspection to ensure that only
				// literal values are accepted here.
				//
				if (!reserved_cli.includes(key)) {
					cli.push(`--${key}`, value);
				} else {
					cli.push(`--hook-${key}`, value);
				}
			});

			return cli;
		}

		safe.each(hooks, (hook, next) => {
			let hookPath;
			const hookBin = `${__dirname}/bin/forever-shim`;
			let keys;

			hook.host = hook.host || this['hook-host'];
			hook.port = hook.port || this['hook-port'];

			if (hook.src) {
				// 1'st guess, this is path to file or module, i.e. just existent path
				hookPath = path.resolve(hook.src);
				if (!existsSync(hookPath)) {
					// 2'nd guess, process module?
					hookPath = `${process.cwd()}/node_modules/${hook.src}`;
					if (!existsSync(hookPath)) {
						// 3'nd guess, no idea, let require to resoolve it
						hookPath = hook.src;
					}
				}
			}

			this.emit('hook::spawning', hook.name);

			if (local) {
				this.childrenSpawn[hook.name] = {
					module: require(hookPath)
				};

				//
				// Here we assume that the `module.exports` of any given `hook.io-*` module
				// has **exactly** one key. We extract this Hook prototype and instantiate it.
				//
				keys = Object.keys(this.childrenSpawn[hook.name].module);
				const mysun = this.childrenSpawn[hook.name];
				mysun.Hook = mysun.module[keys[0]];
				mysun._hook = new (mysun.Hook)(hook);
				mysun._hook.start();

				//
				// When the hook has fired the `hook::ready` event then continue.
				//
				mysun._hook.once('hook::ready', () => next(null));
			} else {
				this.emit("hook::fork", { script: hookBin, name: hook.name, params: cliOptions(hook) });
			}
			this.once(`${hook.name}::hook::ready`, () => {
				connections++;
				if (connections === hooks.length) {
					this.emit('hook::children-ready', hooks);
				}
			});
		}, err => {
			if (!err)
				this.emit('hook::children-spawned', hooks);
			cb(err);
		});

		return this;
	}

	_chieldEmit(type, data) {
		// pass to ourselves
		EventEmitter.prototype.emit.call(this, type, data);

		// pass to remoteListeners
		let cachedBuffer = null;
		this._remoteEvents.emit(type, () => {
			if (!cachedBuffer) {
				cachedBuffer = bufferConverter.serializeNormal({
					message: TINY_MESSAGES.PUSH_EMIT,
					type
				}, data);
			}
			return cachedBuffer;
		});
	}
}

function hookFork(fork) {
	// only master (listening hook) is allowed to fork
	if (!this.listening)
		return;

	// initialize childeren registry and take control on it
	if (!this.children) {
		this.children = {};
		// we taking care on our childeren and stop them when we exit
		process.on('exit', () => {
			for (const child of Object.keys(this.children)) {
				this.children[child].kill();
			}
		});
	}
	ForkAndBind.call(this, fork);
}

function ForkAndBind(fork) {
	class Client {
		constructor(name) {
			this.name = name;
			this._mtpl = {
				message: "tinyhook",
				name,
				msg: undefined,
				data: undefined
			};
		}
		send(msg, data) {
			this._mtpl.msg = msg;
			this._mtpl.data = data;
			if (child)
				child.send(this._mtpl);
		}
	}

	const start = Date.now();
	const restartCount = 0;
	let child = child_process.fork(fork.script, fork.params);
	const clients = {};

	this.emit('hook::fork-start', { name: fork.name, pid: child.pid });
	this.children[child.pid] = child;

	child.on("message", (msg) => {
		let client = clients[msg.name];
		if (client) {
			client(msg.msg, msg.data);
		} else if (msg.message === "tinyhook") {
			if (msg.msg.message === TINY_MESSAGES.HELLO) {
				client = new Client(msg.name);
				clients[msg.name] = this._serve(client);
			}
		}
	});

	child.on("exit", (exitcode) => {
		delete this.children[child.pid];
		// when process die all hooks have to say goodbye

		for (const key of Object.keys(clients)) {
			clients[key]({ message: TINY_MESSAGES.BYE });
		}

		child = null;

		this.emit('hook::fork-exit', { name: fork.name, exitcode });

		// abnormal termination
		if (exitcode !== 0) {
			const lifet = 0.0001 * (Date.now() - start);
			// looks like recoverable error, lets restart
			setTimeout(() => {
				ForkAndBind.call(this, fork);
			}, Math.round(restartCount / lifet));
		}
	});
}

exports.Hook = Hook;