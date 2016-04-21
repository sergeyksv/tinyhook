var Hook = require('../../hook').Hook;
var util = require('util');

var RealMessage = function () {
	this.bigData = "";
	var i=0;
	for (;i<10;i++) {
		this.bigData += "Some simulation of data";
	}
};

var Slave = exports.Slave = function (options) {
	self = this;
	var count = 0;
	Hook.call(this, options);
  var l=0;
	function emitEvent () {
		count++;
		self.emit("someEvent",new RealMessage());
		if (count==100) {
			count = 0;
			console.log(l++,"--------------------------------------");
			setTimeout(emitEvent,20);
		} else
			setImmediate(emitEvent);
	}

	this.on('hook::ready', function () {
		console.log(this._hookMode);
		emitEvent();
	});
}

util.inherits(Slave, Hook);
