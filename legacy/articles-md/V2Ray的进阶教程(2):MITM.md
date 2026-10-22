V2Ray的进阶用法(2): MITM
===================

本文是应小薇姐姐的多次邀请(要求？)后在 Shelikhoo 的指导之下写就的，配置文件也由 Shelikehoo 提供。本文将示范如何借助 V2Ray 完成一套较为 hacky 的骚操作，也即 MITM，最终效果可能可以在一定程度上降低浏览器浏览 HTTPS 网页时的加载延迟（注意不是传输速度），满足性能癖和不折腾不舒服星人的需求。

其实一开始让我写这个，我是拒绝的，因为……算了，这留到最后再说，我们先说一下原理。

先抄一段维基百科：

> 中间人攻击（英语：Man-in-the-middle attack，缩写：MITM）在密码学和计算机安全领域中，是指攻击者与通讯的两端分别创建独立的联系，并交换其所收到的数据，使通讯的两端认为他们正在通过一个私密的连接与对方直接对话，但事实上整个会话都被攻击者完全控制。

还有更加形象的小剧场说明，请前往[维基百科](https://zh.wikipedia.org/wiki/%E4%B8%AD%E9%97%B4%E4%BA%BA%E6%94%BB%E5%87%BB#%E6%94%BB%E5%87%BB%E7%A4%BA%E4%BE%8B)自行观看。

众所周知，全裸的 HTTP 协议是非常容易被 MITM 的，而为了拯救要变成 RBQ 的互联网， HTTPS(HTTP over SSL/TLS) 站了出来——借助 SSL/TLS 的保护，以及庞大的证书体系，我们普通用户在一定程度上没那么容易被攻击了。具体的讲，当你要访问的网页被陌生人劫持了，你将会在浏览器上看到“证书错误”的字样（当然，对某些国产浏览器和预装了流氓证书的系统来说可能不会），但证书错误也可能只是因为网站的证书过期了，此时也许会有个选项让你顶着危险“继续访问”，而要不要访问就取决于你自己了。直接访问 HTTPS 网页和通过一般正向代理(如 Shadowsocks 和 V2Ray 的普通用法)的示意图如下。

![1.png](https://i.yusa.me/B2ugNJD3BxMp.png)
![2.png](https://i.yusa.me/b0CAoq6j6mW8.png)

而我们今天要做的，就是作为中间人，对自己进行 MITM，效果如下图。可以看出在传输过程上，使用 MITM 免去了 TLS 在 V2Ray 的客户端与服务端之间的传输，而 TLS 的建立（用往返箭头表示的）也仅需要发生在浏览器与 V2Ray 客户端、V2Ray 服务端与目标服务器之间，从效率上来说应该会比普通情况稍微快一点。

![3.png](https://i.yusa.me/g1FzzJMb9z9x.png)

极其不严谨的简单测试，以清空缓存后打开 [cloudflare](https://cloudflare.com) 为例：

![before MITM](https://i.yusa.me/KJtAG4OPdvvM.png)
<center>使用 MITM 前</center>

![MITMed](https://i.yusa.me/4rCQL0xepJgz.png)
<center>使用 MITM 后</center>

那么话不多说，直接开始配置吧。首先，我们需要给自己签一张 CA 证书给 V2Ray 用，示范两种方式（均在 Linux 环境进行，Windows 用户可以在服务器上签好再拖回本地）：

### 一、用 OpenSSL 签发

```bash
$ openssl genrsa -des3 -out ca.old.key 2048
$ openssl req -new -key ca.old.key -out ca.req
$ openssl x509 -req -days 365 -signkey ca.old.key -in ca.req -out ca.cer
# 最后转换一下密钥格式
$ openssl rsa -in ca.old.key -out ca.key
```

这样就得到了我们需要的 ca.key 和 ca.cer

### 二、用 v2ctl 签发

v2ctl 是自某个版本开始从 v2ray 主程序分离出来的辅助程序，主要功能是将 json 配置转换为供主程序使用的 pb，而它也包含了很多面向用户的命令行功能，例如生成 uuid，自签证书等。不过 v2ctl 生成的 ca 证书是给 v2ray 配置文件用的 json 格式的，我们还需要手动转换一下保存以便导入进浏览器：

```bash
# 如果你是用官方提供的一键脚本安装的话 v2ctl 就是在 /usr/bin/v2ray/
# 生成证书并将输出保存为 test.json
$ /usr/bin/v2ray/v2ctl cert --ca --expire=114514h > test.json
# 将 test.json 转换为 ca.cer 和 ca.key
$ python -c "(lambda __g: [[[(f.close(), [(f.write(''.join((lambda __iter, __l: ((__l['i'] + '\n') for __l['i'] in __iter))(d['key'], {}))), (f.close(), [(f.write(''.join((lambda __iter, __l: ((__l['i'] + '\n') for __l['i'] in __iter))(d['certificate'], {}))), (f.close(), None)[1])[1] for __g['f'] in [(open('ca.cer', 'w'))]][0])[1])[1] for __g['f'] in [(open('ca.key', 'w'))]][0])[1] for __g['d'] in [(json.load(f))]][0] for __g['f'] in [(open('test.json', 'r'))]][0] for __g['json'] in [(__import__('json', __g, __g))]][0])(globals())"
```

最后一步用到了一个非常有趣的小工具，可以把几行 python 脚本浓缩成一行，强烈安利：[oneliner-izer](http://www.onelinerizer.com/)

如果你想正常一点的话，也可以自己执行这个 python 脚本：

```python
import json

with open("test.json", "r") as f:
    d = json.load(f)
with open("ca.key", "w") as f:
    f.write("".join(i + "\n" for i in d["key"]))
with open("ca.cer", "w") as f:
    f.write("".join(i + "\n" for i in d["certificate"]))
```

现在我们把生成好的证书和密钥拖回本地以后，在浏览器里导入证书：

> Chrome: 打开 chrome://settings/certificates ，在“授权中心”里导入 ca.cer
>
> Firefox: 打开 about:preferences#privacy 并拉到最下面，在 View Certificates 里导入 ca.cer

导入成功后以上两种证书生成方法就可以看出不同了，使用 openssl 生成的你可以在已信任的 CA 列表里找到自己设置的 ORG 名称，而 v2ctl 生成的你则会看到 V2Ray Inc.

准备工作做好了就可以开始配置 v2ray 了，以下配置文件由 Shelikhoo 提供，其实我也没仔细看（复杂的 V2Ray 配置真的太可怕了），照抄基本就行了：

<details markdown="1"><summary>client.json</summary>

```json
{
  "inbound": {
    "allowPassive": true,
    "listen": "127.0.0.1",
    "port": 10854,
    "protocol": "socks",
    "settings": {
      "auth": "noauth",
      "udp": true
    },
    "tag": "vanillas"
  },
  "inboundDetour": [
    {
      "listen": "127.0.0.1",
      "port": 10855,
      "protocol": "http",
      "settings": {},
      "tag": "vanilla"
    },
    {
      "listen": "0.0.0.0",
      "port": 10856,
      "tag": "mitm",
      "protocol": "dokodemo-door",
      "settings": {
        "network": "tcp",
        "timeout": 0,
        "address": "kiri.moe",
        "port": 443,
        "followRedirect": true
      },
      "streamSettings": {
        "security": "tls",
        "tlsSettings": {
          "allowInsecure": false,
          "alpn": [
            "http/1.1"
          ],
          "certificates": [
            {
              "usage": "issue",
              "alpn": [
                "http/1.1"
              ],
              "certificateFile": "/path/to/ca.cer",
              "keyFile": "/path/to/ca.key"
            }
          ]
        }
      },
      "sniffing": {
        "enabled": false,
        "destOverride": [
          "http",
          "tls"
        ]
      }
    }
  ],
  "log": {
    "access": "",
    "error": "",
    "loglevel": "info"
  },
  "outbound": {
    "mux": {
      "enabled": true
    },
    "protocol": "vmess",
    "proxySettings": {
      "tag": "proxy"
    },
    "settings": {
      "vnext": [
        {
          "address": "YOUR_IP",
          "port": 11451,
          "users": [
            {
              "alterId": 16,
              "id": "b4fe5665-cebe-d292-0e66-9139958200f4",
              "level": 0,
              "security": "auto"
            }
          ]
        }
      ]
    },
    "streamSettings": {
      "network": "tcp",
      "security": "none"
    }
  },
  "outboundDetour": [
    {
      "protocol": "freedom",
      "settings": {},
      "tag": "direct"
    },
    {
      "protocol": "freedom",
      "settings": {
        "redirect": "127.0.0.1:10856"
      },
      "tag": "reentry"
    },
    {
      "mux": {
        "enabled": true
      },
      "protocol": "vmess",
      "proxySettings": {
        "tag": "proxy"
      },
      "settings": {
        "vnext": [
          {
            "address": "YOUR_IP",
            "port": 11452,
            "users": [
              {
                "alterId": 16,
                "id": "b4fe5665-cebe-d292-0e66-9139958200f4",
                "level": 0,
                "security": "auto"
              }
            ]
          }
        ]
      },
      "streamSettings": {
        "network": "tcp",
        "security": "none"
      },
      "tag": "notouch"
    }
  ],
  "routing": {
    "settings": {
      "rules": [
        {
          "ip": [
            "0.0.0.0/8",
            "10.0.0.0/8",
            "100.64.0.0/10",
            "127.0.0.0/8",
            "169.254.0.0/16",
            "172.16.0.0/12",
            "192.0.0.0/24",
            "192.0.2.0/24",
            "192.168.0.0/16",
            "198.18.0.0/15",
            "198.51.100.0/24",
            "203.0.113.0/24",
            "::1/128",
            "fc00::/7",
            "fe80::/10"
          ],
          "outboundTag": "direct",
          "type": "field"
        },
        {
          "inboundTag": [
            "vanilla",
            "vanillas"
          ],
          "port": "443",
          "outboundTag": "reentry",
          "type": "field"
        },
        {
          "inboundTag": [
            "vanilla",
            "vanillas"
          ],
          "port": "0-442",
          "outboundTag": "notouch",
          "type": "field"
        },
        {
          "inboundTag": [
            "vanilla",
            "vanillas"
          ],
          "port": "444-65535",
          "outboundTag": "notouch",
          "type": "field"
        }
      ]
    },
    "strategy": "rules"
  }
}
```

</details>

<details markdown="1"><summary>server.json</summary>

```json
{
  "inbound": {
    "allowPassive": true,
    "port": 11451,
    "protocol": "vmess",
    "settings": {
      "clients": [
        {
          "alterId": 16,
          "id": "b4fe5665-cebe-d292-0e66-9139958200f4",
          "level": 1,
          "security": "auto"
        }
      ]
    },
    "streamSettings": {
      "network": "tcp",
      "security": "none"
    }
  },
  "inboundDetour": [
    {
      "allowPassive": true,
      "port": 11452,
      "tag": "notouch",
      "protocol": "vmess",
      "settings": {
        "clients": [
          {
            "alterId": 16,
            "id": "b4fe5665-cebe-d292-0e66-9139958200f4",
            "level": 1,
            "security": "auto"
          }
        ]
      },
      "streamSettings": {
        "network": "tcp",
        "security": "none"
      }
    }
  ],
  "log": {
    "access": "",
    "error": "",
    "loglevel": "info"
  },
  "outbound": {
    "protocol": "freedom",
    "settings": {
      "domainStrategy": "AsIs",
      "timeout": 0
    },
    "streamSettings": {
      "security": "tls",
      "tlsSettings": {
        "allowInsecure": false,
        "alpn": [
          "http/1.1"
        ]
      }
    }
  },
  "outboundDetour": [
    {
      "protocol": "blackhole",
      "settings": {},
      "tag": "blocked"
    },
    {
      "protocol": "freedom",
      "tag": "nointercept",
      "settings": {
        "domainStrategy": "AsIs",
        "timeout": 0
      },
      "streamSettings": {
        "security": "none"
      }
    }
  ],
  "routing": {
    "settings": {
      "rules": [
        {
          "ip": [
            "0.0.0.0/8",
            "10.0.0.0/8",
            "100.64.0.0/10",
            "127.0.0.0/8",
            "169.254.0.0/16",
            "172.16.0.0/12",
            "192.0.0.0/24",
            "192.0.2.0/24",
            "192.168.0.0/16",
            "198.18.0.0/15",
            "198.51.100.0/24",
            "203.0.113.0/24",
            "::1/128",
            "fc00::/7",
            "fe80::/10"
          ],
          "outboundTag": "blocked",
          "type": "field"
        },
        {
          "inboundTag": [
            "notouch"
          ],
          "outboundTag": "nointercept",
          "type": "field"
        }
      ]
    },
    "strategy": "rules"
  }
}

```

</details>

上面配置中，你应该修改的有：证书和密钥的位置，服务器的 IP 和 端口以及 UUID。都已经开始想做这些骚操作了，怎么改也不需要我多说了吧~

该配置将在 [vTemplate](https://git.io/kiri) 同步更新。

成功后，你将可以正常地打开网页，并且查看被代理网页的证书时将会看到已经是自己魔改的 CA 了。

最后提几点我对这个操作的看法吧。在我看来，尽管确实可能在一定程度上提高了浏览网页时的用户体验，可是缺点和令人担忧的地方却也很明显，总的来说有点得不偿失。例如：

1. 无法在浏览器上直接查看网站的真实证书了。这对 web 工作者/爱好者 无疑是灭顶之灾；

2. 在服务端的 V2Ray 与目标服务器的通讯中，V2Ray 相当于客户端，而 Go 的 TLS 库作为客户端的行为是否能满足所有需求值得商榷，例如目标服务器仅支持 TLS 1.3 时就很可能出现问题；

3. 浏览器对发生了什么事的掌控能力下降了。例如浏览器失去了对哪些 CA 值得信任的选择权，当真的遭到 MITM 时也不知道会怎么样。

4. 这个配置简直完美地体现了 V2Ray 饱受诟病的缺点——它过于复杂了。尽管它是严格按照文档来写的，依然让它的可读性非常差。

其实本来这篇我想写的是《关山口男子职业技术学校简明生存指南》的，结果一口气咕了一个多月，实在有点过意不去。所以到下一篇文章更新看来又要咕很久啦。

那么，我们下期再见~~

参考资料：

[V2Ray 官方网站](https://v2ray.com)

[vTemplate](https://git.io/kiri)