# tinyhook - limited replacement of hook.io

[hook.io](https://github.com/hookio) is a distributed 
EventEmitter built on node.js. In addition to providing a 
minimalistic event framework, hook.io ALSO....

In fact hook.io is rather that ALSO than minimalistic event 
framework. Now it can do lot of things like accepting messaging
from console, self restoring of mech network when master died,
mdns hooks discovery and so all. This all good, sounds like magic, but
we do belive that hook.io doesn't do its main thing - reliable and
lightweight dispatcing of events.

In contrast tinyhook is created with single goal to provide reliable
and lightweight distributed EventEmitter implementation. It follows
hook.io concept and in some cases it can transparently replace hook.io.

Reliable for us means that application should be able to consists from 
dozens of processes running hooks and handle millions of messages a day
without issues, hight CPU usage and hight memory consumption. On the
moment of creation it was 2-4 times more effective for CPU usage, memory
consumption and latency of message delivery. This is not just words, our
simple ping-pong test (/test/fifo-test.js) takes 2 seconds on tinyhook
and >30 seconds on original hook.io.

It will be honest to say that it is build with help of light weight nssocket
library which is build by authors of hook.io. I would say many thanks to them!

Enjoy!

## hook.io compatibility notes
We try to be as close as possible to hook.io functionality. However we add things
mostly on demand and only if they make sense. What is supported:

* name space rules - '::' is delimiter, event from client is prefixed by its name
* 'hook::ready' event
* 'children::ready', 'children::spawned' events for spawn
* 'hook-port','hook-host','name', 'silent','local' options
* 'start', 'stop', 'listen', 'connect' methods
* 'hook.ready', 'hook.listening' flags
* 'spawn' method. NOTE, it is required to install 'forever' module to get ability 
to spawn hook in separate process.
*  hook.emit pattern is limited to (type, data). NOTE, callback is not 
supported and will never be. Messaging implies total uncertainity about 
availability of recipients and this is main difference with remote 
procedure call approach. If you want to get data using messages you have
to sent messages :), see example below. It is possible to build kind of 
RPC on top of messaging protocol, but messaging itself can't be RPC.

```
master.on('client:reply', function (reply) {
   console.log(reply);
});
master.emit('request','What is your name');

// this code listen for request, and broadcast reply
client.on('*::request', function () {
   client.emit('reply',client.name);
})
```

## new stuff
* lightweight, core is < 200 lines
* always work using sockets so inprocess hook behavior and interprocess will remain the same, no surprises
* work as smart hub, dispatching events only to clients that need them (subscribe)
* emits 'hook::newListener' with handler 'function (type, hookName)'
* accept also 'port' and 'host' for options (without 'hook-' prefix)
* linked by default to lightweight forever replacement (tinyforever)

## MIT License

Copyright (c) [PushOk Software](http://www.pushok.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
