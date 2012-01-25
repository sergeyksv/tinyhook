var hookio = require('./hook'),
    async  = require('async'),
    path   = require('path');

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
  
	if (!this.listening) {
		return onError(new Error('Cannot spawn child hooks without calling `.listen()`'));
	}  

	if (typeof hooks === "string") {
		hooks = new Array(hooks);
	}

	types = {};
  
	if (typeof hookio.forever === 'undefined') {
		try {
			hookio.forever = require('forever');
		}
		catch (ex) {
			hookio.forever = ex;
		}
	}
  
	local = self.local || !hookio.forever || hookio.forever instanceof Error;
	
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

		hook['host'] = hook['host'] || self['hook-host'];
		hook['port'] = hook['port'] || self['hook-port'];

		if (hook.src) {
		  hookPath = process.cwd() + '/node_modules/' + hook.src;
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
			self.children[hook.name].Hook  = self.children[hook.name].module[keys[0]];
			self.children[hook.name]._hook = new (self.children[hook.name].Hook)(hook);

			//
			// When the hook has fired the `hook::ready` event then continue.
			//
			self.children[hook.name]._hook.once('hook::ready', next.bind(null, null));
			self.children[hook.name]._hook.connect(self);
		}
		else {
			//
			// TODO: Make `max` and `silent` configurable through the `hook.config`
			// or another global config.
			//
			options = {
				max: 10,
				silent: false,
			};
			
			options.options = cliOptions(hook);

			child = new (hookio.forever.Monitor)(hookBin, options);
			child.on('start', function onStart (_, data) {
				// Bind the child into the children and move on to the next hook
				self.children[hook.name] = {
				  bin: hookBin,
				  monitor: child
				};
			
				self.emit('child::start', hook.name, self.children[hook.name]);
				next();
			});
		  
			child.on('restart', function () {
				self.emit('child::restart', hook.name, self.children[hook.name]);
			});
		  
			child.on('exit', function (err) {
				self.emit('child::exit', hook.name, self.children[hook.name]);
			});

			child.start(); 
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
