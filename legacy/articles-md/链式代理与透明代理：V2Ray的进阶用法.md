链式代理与透明代理：V2Ray 的进阶用法
=====================

今天（本文开始写的时候）小薇姐姐在群里作了这么一个预告：

> 这个是 TLS 下一步的进化方向：
>
> https://github.com/v2ray/v2ray-core/commit/318a36fe581ac7cab329a3a23624f99e43333d60

V2Ray, 或者准确的说是 Project V, 她在一开始对自己的介绍就是一个模块化的代理工具包平台，而显然，她已经在这条路上越走越远了。刚从 Shadowscoks/R 之类的代理软件过来的用户，看着文档可能会一头雾水：我只是想翻墙就好，不需要这么多乱七八糟的，为什么同样以 json 作为配置文件，V2Ray这些都是啥玩意啊？

如果你对这些是啥玩意并没有兴趣，你可以直接食用我的模板 <https://git.io/kiri> ，或者使用直接使用一键脚本。如果你又兴趣，你可以仔细看一下官方文档和白话文版文档，我相信你会对仅仅将 V2Ray 当作 ss 替代品感到后悔的。今天就简单地水一下 V2Ray 的两种用法：链式代理和透明代理。

<span id="1">[透明代理](#1)</span>
---------

透明代理顾名思义，就是一个“一般用户”察觉不到就走了的代理服务器，从实现上是将所有的流量都转发给一台代理，从而做到全局代理的效果（跟 VPN 还是有区别的）。透明代理对于翻墙用户来说一般是部署在软路由上的，当然如果你的 PC 装的是 Linux 的话操作完全一样。下面就针对 Linux 系统来介绍透明代理， Windows 用户也可以通过 Hyper-V 开一个 Linux 虚拟机做软路由，或者借助一些其他的软件。

对 ss 这类软件，这个操作需要借助一些第三方软件才能完成，比如说，[redsocks](https://github.com/darkk/redsocks). 在这里，redsocks 的作用是将所有所有 TCP 连接转发到上游的代理服务器，比如 ss 监听在本地的 socks 代理，转发请求这个操作在 Linux 平台上一般是用 iptables 完成的。而我们现在用的是 V2Ray，打开文档，翻到[Dokodemo door 这一节](https://v2ray.com/chapter_02/protocols/dokodemo.html), 官方是这样描述的：

> Dokodemo door（任意门）是一个传入数据协议，它可以监听一个本地端口，并把所有进入此端口的数据发送至指定服务器的一个端口，从而达到端口映射的效果.

是不是很熟悉？没错，也就是说 V2Ray 自身就可以实现 Redsocks 的功能！我们的透明代理并不需要第三方软件！

### 一个场景：我已经配置好了服务器和客户端，现在想实现让所有流量都走代理（也就是outbound）——

那就直接参考[官网的示例](https://v2ray.com/chapter_02/protocols/dokodemo.html), 具体来说，你可以写出这样的配置文件：

<details markdown="1"><summary>config.json</summary>
```json
    {
     "inbound": {...},
     "outbound": {...},
     "inboundDetour": [
         {
             "domainOverride": ["tls","http"],
             "port": 12345,
             "protocol": "dokodemo-door",
             "settings": {
                 "network": "tcp,udp",
                 "followRedirect": true
             },
             "tag":"door"
         },
         ...
     ],
     "outboundDetour": [...],
     "routing": {
        "strategy": "rules",
        "settings": {
          // 添加下面这条规则
          "rules": [{
            "type": "field",
            "inboundTag": ["door"],
            "outboundTag": "你想传出的tag"
          }],
    	}
    }
```
  </details>

在完事之后，用 iptables 将所有 tcp 流量转发到 door 对应的 12345 端口：



```bash
$ iptables -t nat -N V2RAY
  
$ iptables -t nat -A V2RAY -d 0.0.0.0/8 -j RETURN
$ iptables -t nat -A V2RAY -d 10.0.0.0/8 -j RETURN
$ iptables -t nat -A V2RAY -d 100.64.0.0/10 -j RETURN
$ iptables -t nat -A V2RAY -d 127.0.0.0/8 -j RETURN
$ iptables -t nat -A V2RAY -d 169.254.0.0/16 -j RETURN
$  iptables -t nat -A V2RAY -d 172.16.0.0/12 -j RETURN
$ iptables -t nat -A V2RAY -d 192.168.0.0/16 -j RETURN
$ iptables -t nat -A V2RAY -d 198.18.0.0/15 -j RETURN
$ iptables -t nat -A V2RAY -d 224.0.0.0/4 -j RETURN
$ iptables -t nat -A V2RAY -d 240.0.0.0/4 -j RETURN
 
$ iptables -t nat -A V2RAY -p tcp -j REDIRECT --to-ports 12345
$ iptables -t nat -A OUTPUT -p tcp -m owner --uid-owner kiri -j V2RAY
$ iptables -t nat -A OUTPUT -p tcp -m owner --uid-owner root -j V2RAY

```

这样就差不多完了。



### 另一种场景：我们公司/学校里有一个 http-connect/socks 代理，我想要所有流量都通过代理上网——

这个需求其实有很多其他专门的软件可以解决，比如 redsocks，但是为了显示 V2Ray 的万能，我们来用V2Ray 来完成这件事。

首先，如果是 socks 代理，事情很简单，我们只需要这样写：

<details markdown="1"><summary>config.json</summary>

```json
	{
    "inbound":{
         "domainOverride": ["tls","http"],
         "port": 12345,
         "protocol": "dokodemo-door",
         "settings": {
             "network": "tcp",
             "followRedirect": true
         }
     },
     "outbound": {
            "protocol": "socks",
            "settings": {
                "servers": [
                    {
                        "address": "127.0.0.1",	//这是上游socks代理的ip
                        "port": 3378	//这是上游socks代理的端口
                    }
                ]
            }
        }
	}
```
</details>

然后，跟上一个情景一样，使用 iptables 将所有流量转发到 12345 端口即可~

不过，如果公司提供的代理类型是 http-connect 的话，问题会有点没那么简单，因为 V2Ray 的传出代理并不支持 http ，而小薇姐姐也说并没有支持的计划（参见 [issue#40](https://github.com/v2ray/Planning/issues/40)），于是我们可以借助 eq 的 [h2s](https://github.com/Equim-chan/h2s/) 来实现啦~

h2s 的作用就是将一个 http 代理转化为一个 socks 代理，然后 V2Ray 的配置就参考上面一样的写就行啦~

不过还有一点要注意的，尽管将 http 代理转换成了 socks代理，但是由于 http 代理是不支持 udp 的，因此我们依然只能将所有 tcp 连接进行转发。

<span id="2">[链式代理](#2)</span>
-----------------------

要说有什么事情是只用一键脚本的人绝对不知道，而好好看文档的人应该会知道的话，那就是链式代理了。链式代理在 SS/R 中被叫做 “前置代理”，Windows 版和 Android 版的 SS/R 都是有的，而在 V2Ray 中，这个功能更为强大。

为了解释这个概念，官方文档中给出了这么一个例子：当你觉得机场虽然线路可以保证，但是却不能保证安全，而自建的服务器成本太高（包括一个好线路的成本和被墙的风险成本），你可以选择一个折衷的选项——买一个 SS 机场，随便买一台国外服务器（不需要多好的线路），然后把 SS 和 V2Ray 串起来！

听起来有点不可思议？来看一下我画的示意图你差不多就懂了。

![1.png](https://i.yusa.me/wdIQ13rrNwgr.png)

这是我们本来直接使用 SS/V2Ray 时的情景，我们对目标网站的请求被包装在一条可靠的隧道中，穿过墙到达代理服务器（或者机场服务器）后，由代理服务器转发到目标网站，非常好懂。

![屏幕截图.png](https://i.yusa.me/47f8L0RKW0oN.png)

而现在，买下了一家机场的 SS，于是我们在本地到机场之间建立起了一条隧道，在直接把原始请求发给自建服务器之前，我们在里面再加一条通往自建服务器的隧道，最后把原始请求包装在最里面，穿过防火墙、到达机场、送达自建服务器，最后才发到目标网站。这样，我们既利用了机场的好线路，又保障了一定程度的数据安全。

### 就用 SS 机场做例子，现在怎么做？

直接参考官方文档的做法就行了：

<details markdown="1"><summary>config.json</summary>
```json
{
  "inbound": {
    "port": 8080,
    "protocol": "socks",
    "settings": {
      "auth": "noauth",
      "timeout": 0
    },
  },
  "outbound": {
    "protocol": "vmess",
    "settings": { // settings 的根据实际情况修改
      "vnext": [
        {
          "address": "1.2.3.4",
          "port": 8888,
          "users": [
            {
              "alterId": 64,
              "id": "b12614c5-5ca4-4eba-a215-c61d642116ce"
            }
          ]
        }
      ]
    },
    "proxySettings": {
        "tag": "transit"  // 这里的 tag 必须跟作为中转 VPS 的 tag 一致，这里设定的是 "transit"
      }
  },
  "outboundDetour": [
    {
      "protocol": "shadowsocks",
      "settings": {
        "servers": [
          {
            "address": "2.2.2.2",
            "method": "aes-256-cfb",
            "ota": false,
            "password": "password",
            "port": 1024
          }
        ]
      },
      "tag": "transit"
    }
  ]
}
```
</details>

简单的说，就是在你准备发往自建服务器的outbound里加一个字段 <span class="red">proxySettings</span>, 它的值对应的是写给机场的 outbound 的 tag，然后接下来给机场写一个 outbound，协议为 ss，tag 和上面对应就行了。这样就完成了我们的链式代理。

不过！光靠 proxySettings 是有一个大坑的，也就是当我们使用 proxySettings 的时候，streamSettings 就失效了！这会导致我们不能使用ws，tls这些骚操作（虽然实际上并不需要，因为这部分流量已经在国外了）。不过真的我们这样就无计可施了吗？

当然不是，不然怎么说V2Ray是万能的呢。回到上一节，我们有一个可以处理所有tcp，udp请求的 dokodemo-door，它当然也可以用来处理ws了。

重写以上配置文件：

<details markdown="1"><summary>config.json</summary>
```json
{
  "inbound": {
    "port": 8080,
    "protocol": "socks",
    "settings": {
      "auth": "noauth",
      "timeout": 0
    },
  },
  "outbound": {
    "protocol": "vmess",
    "settings": {
      "vnext": [{
        "address": "127.0.0.1", // 注意这里
        "port": 50001,          // 注意这里。端口可自定义，与下方任意门的相同即可
        "users": [{
          // 此处与原先的配置相同
          // ...
        }]
      }]
    },
    "streamSettings": {
      "network": "ws",
      "security": "tls",
      "wsSettings": {
        // path 等设置与原先的相同
        // ...
        "headers": {
          "Host": "你的主机名(一般是域名)" // 请务必正确地配置这段，否则 WS 握手会失败
        }
      },
      "tlsSettings": {
        // ...
        "serverName": "你的主机名(一般是域名)", // 请务必正确地配置这段，否则 TLS 握手会失败。一般的，它与上述的 Host 相同
      }
    }
  },

  // 新加入的任意门 inbound，用于内部桥接
  "inboundDetour": [{
    "listen": "127.0.0.1",
    "port": 50001, // 与上面的 VMess 的 port 相同即可
    "protocol": "dokodemo-door",
    "settings": {
      "network": "tcp", 
      "address": "在此填上原本应该填在 VMess 的 address 里的内容", // 注意这里，一般来说就是你的 v2ray 服务端地址
      "port": 443 // 在此填上原本应该填在 VMess 的 port 里的内容。同上
    },
    "tag": "bridge" // tag 是必须要有的，否则无法进行路由
  }],
  "outboundDetour": [
    {
      "protocol": "shadowsocks",
      "settings": {
        "servers": [
          {
            "address": "2.2.2.2",
            "method": "aes-256-cfb",
            "ota": false,
            "password": "password",
            "port": 1024
          }
        ]
      },
      "tag": "transit"
    }
  ]
  ……
  "routing": {
    "strategy": "rules",
    "settings": {
      // 添加下面这条规则
      "rules": [{
        "type": "field",
        "inboundTag": ["bridge"],
        "outboundTag": "transit"
      }],
      // 其余部分不变
      // ...
    }
  }
}
```
</details>

具体的原理就不说了，自己看看配置理解一下吧。

###  回到上面公司的话题，如果我没有 Linux 环境也没有路由器也不想做软路由，除了透明代理以外我还有什么选择吗？

有的！让我们想一下这个逻辑，我们刚刚是将机场提供给我们的 Shadowsocks 代理做成了链式代理，在 SS 的隧道里面藏进了一个 V2Ray，那么现在公司提供给了我们一个 socks 代理，道理难道不是一样的嘛？

没错，就是一样的。我们只需要将上面配置的 OutboundDetour 中的 shadowsocks 协议改为 socks 协议就可以了。公司提供的是 http 代理的话，就用 h2s 将http代理转换为 socks 代理就可以了。

这些配置我就不给模板了，因为视具体情况而言配置会差别比较大，再说在本文开头我也是建议你们去看一下官方文档来着的~

那我们就下次再见啦~

参考资料：

* [官方文档](https://v2ray.com/)
* [白话文文档](https://toutyrater.github.io/)
* [eq 的 h2s 和它的 issue](https://github.com/Equim-chan/h2s/issues/1)

