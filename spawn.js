var hookio = require('./hook'),
    async  = require('async'),
    path   = require('path'),
    fs = require('fs'),
    existsSync = fs.existsSync || path.existsSync,
	child_process = require("child_process"),
	EventEmitter = require('eventemitter2').EventEmitter2;

exports.spawn = function (hooks, callback) {
	var self = this,
		connections = 0,
		local,
		names;

	if (self.children==null)
		self.children=[];

	 function onError (err) {
		self.emit('error::spawn', err);
		if (callback) {
		  callback(err);
		}
	}

	if (!this.ready) {
		return onError(new Error('Cannot spawn child hooks without being ready'));
	}

	if (typeof hooks === "string") {
		hooks = new Array(hooks);
	}

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
	};


	function spawnHook (hook, next) {
		var hookPath,
			hookBin = __dirname + '/bin/forever-shim',
			options,
			child,
			keys;

		hook.fork = true;

		hook['host'] = hook['host'] || self['hook-host'];
		hook['port'] = hook['port'] || self['hook-port'];

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
			hook.fork = false;
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
			console.log("hook::fork::call");
			self.emit("hook::fork",{script:hookBin, params:cliOptions(hook)});
		}
	}

	self.many('*::hook::ready', hooks.length,  function () {
		connections++;
		if (connections === hooks.length) {
			self.emit('children::ready', hooks);
		}
	});

	async.forEach(hooks, spawnHook, function (err) {
		if (err) {
		  return onError(err);
		}

		self.emit('children::spawned', hooks);

		if (callback) {
		  callback();
		}
	});

	return this;
};
