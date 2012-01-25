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
witout craching, hight CPU usage and hight memory consumption. On the
momemt of creation it was 2-4 times more effective for CPU usage, memory
consumption and latency of message delivery.

It will be honest to say that it is build with help of light weight nssocket
library which is build by authors of hook.io. I would say many thanks to them!

Enjoy!

## MIT License

Copyright (c) [PushOk Software](http://www.pushok.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.