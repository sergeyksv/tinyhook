# tinyhook - limited replacement of hook.io

[hook.io](https://github.com/hookio) is a distributed
EventEmitter built on node.js. In addition to providing a
minimalistic event framework, hook.io ALSO....

In fact hook.io is rather that ALSO than minimalistic event
framework. Now it can do lot of things like accepting messaging
from console, self restoring of mech network when master died,
mdns hooks discovery and so all. This all good, sounds like magic, but
we do belive that hook.io doesn't do its main thing - reliable and
lightweight dispatching of events.

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

Enjoy!

## hook.io compatibility notes
We try to be as close as possible to hook.io functionality. However we add things
mostly on demand and only if they make sense. What is supported:

* name space rules - '::' is delimiter, event from client is prefixed by its name
* 'hook::ready' event
* 'hook-port','hook-host','name', 'silent','local' options
* 'start', 'stop', 'listen', 'connect' methods
* 'hook.ready', 'hook.listening' flags
* 'spawn' method

## tinyhook specific

* always work using sockets so inprocess hook behavior and interprocess will remain the same, no surprises
* work as smart hub, dispatching events only to clients that need them (subscribe)
* emits 'hook::newListener' with data '{type:string, hook:string}'
* accept also 'port' and 'host' for options (without 'hook-' prefix)

*  hook.emit pattern is limited to (type, data). NOTE, callback is not
supported and will never be. Messaging implies total uncertainty about
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

* 'mode' option. Declares communication option: direct, netsocket, fork (nodejs
native IPC channel)

* handling of 'hook::fork' event. This is essentially wrapper on
`child_process.fork(script, params)` method that install IPC communication
channel so any hooks created from forked process will be able to use fork
communication mode. In addition to that 'hook::fork' provides some xtra sugar
for keeping process running (does restart). 'hook::fork' receives data in form
`{name:string, script:string, params:object, options:object}`

  'name' is supposed to be used for identification. Basic life-cycle events are fired:
  'hook::fork-start' and 'hook::fork-exit'

* function `.onFilter`. This function allows to listen on specific event and with additional filtering support. This can be useful for load ballancing when more than one hooks will process same data but each need to process its own portion
    ```
    /**
     * @param {String} type Event type
     * @param {String} selValue Ballance selector value
     * @param {String} filterId Globally unique id for this filter
     * @param {Function} fnFilter Ballance selector emmiter function
     * @param {Function} listener
    */
    ```
    `fnFilter` here is arbitrary function that takes event paramater (denoted as `obj`) and produce some result (aka shard key). Particular listerner passed to this function will be called only if `fnFilter` function result will match to `selValue`. Primary benefit from this function is that it can work inside a root hook (routing hook) and send only data that will pass the filter.

## Revision history and compatibility notices

### 0.5 - Update dependencies.

* Update dependencies to address vulnerabilities

### 0.4 - Update dependencies. ES6 syntax

* Minimum version of Node.js v6

### 0.3 - More speed from faster and smart serialization

* fine tuned serialization function, not it is almost twice faster than in 0.2. 0.3 hooks cannot talk with 0.2 hooks, be careful
* optimized ammount of serialization calls for case when same message sent to many nodes
* optimized serialization for bypass messages (no xtra JSON.stringify/parse)
* introduced new function `.onFilter` that can filter events on routing stage

### 0.2 - Speed optimizations, removed nssocket and forever dependencies

* hook mode support introduced
* hook::fork functionality implemented
* all service events now prefixed with hook:: namespace
   * children::ready -> hook::children-ready
   * children::spawned -> hook::children-spawned
* child::exit, child::restarted abandoned in favor of hook:fork-start/exit
* hook::newListener now get object {type:type, hook:hookName} as data

### 0.1 - Initial release

## MIT License

Copyright (c) [PushOk Software](http://www.pushok.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
