自建 DNS 和 KeePass 服务器
=============

前两天跟风薅了一台 1C1G1M 的国内腾讯云, 放在以前我是懒得薅这种东西的, 毕竟 1M 本来就处处受限, 而学生优惠也迟早会失效. 而这次的车可以 360 一口气买五六年, 于是就薅了一台五年的上海. 买完以后想了一想, 1M 能做什么呢?

代理和离线下载肯定是不行了(尽管下行有 20M), 用来建站怕是也够呛(何况我也不想备案), 那么我能想到的还有:

* 自建无污染 DNS

* 自建对稳定性有要求但是对带宽要求不高的即时数据服务, 比如 KeepAss (接下来我都会这么写, 请习惯这个操作)

* 内网穿透, frp, ngork 等

* 做 ssh 跳板.

* 一些对取回本地要求不大的数据处理业务, 比如爬虫采集(?)

我们今天就来看看前两个啦.

<span id="dns">[用 DNSCrypt-Proxy + Dnsmasq 自建 DNS](#dns)</span>
-------------

尽管会点进本文来看的人应该都知道 DNS 是什么了, 不过既然是水贴姑且还是提一下吧. DNS, 写出全名 <span class="hljs-string">`Domain Name System` </span> 应该就好理解很多了, 它就是用来把域名解析为 ip 用的. 当我们打开浏览器使用 http/https 访问网站的时候, 要发起一个 http/https 连接, 首先需要发起一条 TCP 连接, 而 TCP 连接必须知道对方的 ip 和端口号才能创建, 也就是说无论如何我们都需要把域名转换成 ip 才行. 而把域名转换成 ip, 就是 DNS 的工作了. 全世界有那么几个 DNS 根服务器, 又有无数的小缓存服务器, 在默认的情况下, 我们的电脑 / 路由器会使用上游通告的 DNS, 当我们要打开一个网站时就会先向那个 DNS 询问对应的 ip 地址, 如果缓存中有这个域名就直接返回结果给我们, 如果没有或者缓存失效了就向上一级查询再把结果给我们.

听起来很简单, 而 DNS 当时设计的也很简单, 并没有考虑过会有人在这种基础服务上做坏事. 没错, 我们现在身处的就是到处有人在做坏事的网络环境.

所谓的坏事, 一般指的有两个: DNS 污染(缓存投毒) 和 DNS 劫持, 前者就是我们这次要解决的目标, 它就是导致我们无法打开 [pixiv](https://pixiv.net) 和 [steam 社区](https://steamcommunity.com) 的原因, 因为受到污染的 DNS 返回给了我们一个错误的结果, 而我们的电脑毫无保留地相信了她. 所以说年轻人呐, 谈恋爱不能总想着掏心掏肺的, 一定也要保持理性哦. 他跟你说他在寝室, 结果朋友圈里发的定位是在宾馆, 这能一样嘛.

为了解决这个问题, 我们的思路是这样的: 使用 [Dnsmasq](www.thekelleys.org.uk/dnsmasq/doc.html) / [Unbound](https://www.unbound.net/) / [bind](https://www.isc.org/downloads/bind/)等对外提供 DNS 服务并且缓存记录, 使用 [DNSCrypt-Proxy](https://github.com/jedisct1/dnscrypt-proxy) / [dns-over-https](https://github.com/m13253/dns-over-https) / [dingo](https://github.com/pforemski/dingo) 等客户端向上游 DNS(主要是国外服务器)以加密的方式解析 DNS, 比如用 dnscrypt 或者 DoH (DNS-over-HTTPS), 然后最好还能将国内的域名使用国内 DNS(比如阿里 DNS 或者 114)来解析以保证不会解析到奇奇怪怪的 CDN 节点去.

在一开始选择用 dnscrypt 还是 DoH 的问题上我有点犹豫不决, 然后在大佬们的建议下, 由于觉得 dnscrypt 尽管已经加密了, 但还是可能在国境被 reset, 所以还是决定使用 DoH 了. 最后决定的是使用 Dnsmasq +　DNSCrypt-Proxy 的组合, 而 DNSCrypt-Proxy 其实不但支持 dnscrypt 查询也支持 DoH, 可以说非常理想了.

总算进入正题, 我们开始安装配置吧.

先来安装 DNSCrypt-Proxy, 官方提供了详细的[安装指南](https://github.com/jedisct1/dnscrypt-proxy/wiki/installation), 下面我讲的将以腾讯云 x86_64 平台的 Ubuntu 16.04 系统为例.

```bash
# 下载预编译包
$ wget https://github.com/jedisct1/dnscrypt-proxy/releases/download/2.0.6/dnscrypt-proxy-linux_x86_64-2.0.6.tar.gz

# 解压
$ tar xf dnscrypt-proxy-linux_x86_64-2.0.6.tar.gz

# 进入文件夹并将示例配置重命名
$ cd linux-x86_64 && mv example-dnscrypt-proxy.toml dnscrypt-proxy.toml

# 开始编辑配置文件
$ vim dnscrypt-proxy.toml
```

主要就是改两个地方, 别的暂且都不需要动.

```vim
#因为傻逼腾讯云没有 ipv6, 所以我们的监听地址也必须只留下 ipv4
listen_addresses = ['127.0.0.1:5353']

#既然决定了要用 DoH 而不用 dnscrypt, 那就把 dnscrypt 关掉
dnscrypt_servers = false
doh_servers = true

#其余的有需要自己看文档吧~
```

编辑完以后开始安装 systemd-service 并启动:

```bash
$ sudo ./dnscrypt-proxy -service install
$ sudo ./dnscrypt-proxy -service start
```

这样, DNSCrypt-Proxy 会自动在 DNS 列表中寻找合适的 DoH 服务器, 不需要我们自己指定上游. 如果对上游有需要, 就自己看文档吧. 使用 `#!bash sudo systemctl status dnscrypt-proxy` 确认运行正常后即可开始测试可用性: 

```bash
$ nslookup google.com 127.0.0.1 -port=5353
Server:		127.0.0.1
Address:	127.0.0.1#5353

Non-authoritative answer:
Name:	google.com
Address: 216.58.205.174
```

去 <https://ipip.net> 之类的地方确认一下这确实是咕果的 ip 以后, DNSCrypt-Proxy 就配置完啦. 首次查询可能会比较慢, 这是很正常的, 第二次就 ~~习惯~~ 舒服了接下来配置 Dnsmasq:

```bash
#就直接用 apt 装啦
$ sudo apt-get install dnsmasq

#编辑 dnsmasq.conf
$ vim /etc/dnsmasq.conf

#vim>
...
#把上游 DNS 换成我们自己的 DNS
server=127.0.0.1#5353
...
#<vim

#编辑完成退出后重启服务
$ sudo systemctl restart dnsmasq
```

现在再试试用 53 端口查询:

```bash
$ nslookup google.com 127.0.0.1
Server:		127.0.0.1
Address:	127.0.0.1#53

Non-authoritative answer:
Name:	google.com
Address: 216.58.205.142
```

最后, 我们用肥猫聚聚的 [dnsmasq-china-list](https://github.com/felixonmars/dnsmasq-china-list) 来实现国内域名使用国内上游:

```bash
# 你当然可以自己把这个 repo 下的文件丢进 / etc/mentohust, 也可以直接用肥猫聚聚的脚本. 这里用后者
$ wget https://raw.githubusercontent.com/felixonmars/dnsmasq-china-list/master/install.sh

#(Optional) 因为我喜欢拿阿里和中科大当上游, 所以自己编辑一下
$ vim install.sh

#vim>
...
SERVERS=(223.5.5.5 202.38.93.153 223.113.97.99)
...
#<vim

#运行脚本
$ bash install.sh
```

这样就万事大吉 (假) 啦. 根据需要, 你接下来还可以配置防火墙 / 更换端口来防止滥用, 用 bind/unbound 替换 dnsmasq, 给 dnsmasq 添加去广告 hosts 等等. 不过, 一个建议是尽量不要公开你的 dns, 为了安全着想.

<span id="#keepass">[配置 KeepAss 的同步服务器](#keepass)</span>
-----------

KeepAss 是一款开源的密码管理软件, 不但全平台有客户端, 可以使用本地数据库, 还可以将数据库寄存在各种存储服务上, 比如国内的坚果云, 或者国外的 Dropbox 和 Google Drive 等等等等. 经常拿来与 KeepAss 比较的有各种闭源密码管理服务如 LastPass 等等.

实际上本文我想介绍的 KeepAss 的服务端搭建, 因此关于它本身就不多作介绍啦~

KeepAss 同步的方式有非常多, 包括 ftp/http(s)-WebDav/sftp 等等, 可惜各个客户端的实现程度各不相同. 平均地想来, https-WebDav 可能是支持最广泛也最安全的方式了. 我们今天的目标是在服务器上搭建 WebDav-KeepAss 数据库以及 KeeWeb.

首先在 [这里](https://keepass.info/download.html) 下载你需要的 KeepAss 客户端(记得往下拉来看, 有一大堆可以选), 我推荐 Andoid 用 KeePass2Android , 而电脑上则用跨平台的 KeeWeb, KeeWeb 既可以在本地做离线客户端, 也可以配合浏览器插件实现自动填充密码, 还可以在服务器上搭建网页版来随时随地访问你的数据库. KeeWeb 有一个官方的[网页版 app](https://app.keeweb.info/), 如果你放心的话就可以用, 不过国外网站的稳定性不一定能得到保障, 总之还是先自己搭啦.

首先, 你需要生成一个 KeepAss 的数据库, 下载一个电脑版客户端然后按部就班地生成一个后缀是 .kdbx 的数据库文件, 将它放到服务器上, 比如我们就放在 <span class="hljs-string">`/home/kiri/keepass/NewDatabase.kdbx`</span> .

接下来配置 Web Server 和 WebDav. 一如既往地, 在这种地方我选择小巧简单的 Caddy 作为 Web Server, 其他 Web Server 如 Nginx 配置 KeeWeb 时请自己参考 [官方文档](https://github.com/keeweb/keeweb/wiki/WebDAV-Config) 安装 Caddy 时注意勾选:

> 必要插件: <span id="#keepass">`http.cors`</span>
>
> 可选插件: <span id="#keepass">`http.webdav`</span>, <span id="#keepass">`http.filemanager`</span>

如果你之前安装 Caddy 时没有装上 `http.cors` 的话, 请重装 Caddy 并勾选上. 由于最近我用 Caddy 频率非常高, 过段时间可能会写一个 Caddy 的安装脚本, 现在如果想要用一键脚本的话可以先用 [Toyo](https://doub.io) 写的.

如果你去看一下 Caddy 的文档的话, 你会发现我上面列出的两个可选插件 `http.webdav` 和 `http.filemanager` 都提供 WebDav 的功能,  ~~可是我昨天尝试的时候发现并不能直接使用, 如果你测试可以用请来教一下我~~ 所以现在如果不借助 Caddy 自带的 WebDav 的话我们就得另外找一个 standalone 的 WebDav 软件, 再用 Caddy 去反代了. (刚写完就被自己打脸了, ) 我用的是这个:

<https://github.com/wolf71/TinyWebDav/>

下面来先试一下:

```bash
#下载 webdav.py
$ wget https://github.com/wolf71/TinyWebDav/blob/gh-pages/webdav.py

#编辑一下细节
$ vim webdav.py

#vim>
...
#这玩意在倒数第三行
root = DirCollection('/home/kiri/keepass', '/')
#注意我们刚刚把数据库文件放在了 /home/kiri/keepass/ 下
```

然后在我们放 webdav.py 的同一个文件夹里再新建一个 wdusers.conf 文件, 来记录我们的账号和密码(注意这 __不是你数据库的密码!!!__):

```bash
$ echo "admin:password" > wdusers.conf
```

然后运行 webdav.py:

```bash
$ python webdav.py
#注意接下来会打印出你的服务器和对应的端口, 但是服务器 ip 可能不对(反正我的是不对), 记得用自己的 ip
#默认的端口是8000
```

然后比如用手机来测试, 打开 KeePass2Android, 选择同步方式为 http(webdav), 然后输入 url , url 是 http://ip:8000/NewDatabase.kdbx, 最后输入密码, 如果成功就说明我们的 webdav 工作正常.(或者先用别的 WebDav 浏览器打开试试, chrome 直接访问 ip:port 应该也可以)先把它停止, 丢进 screen 里后台运行(screen 是一个 shell 窗口管理软件, 具体用法请自己咕果)

接下来配置 KeeWeb 和 Caddy, 要用 https 当然你首先需要把 ip 解析上来 :

```bash
#下载 KeeWeb 的静态文件
$ wget https://github.com/keeweb/keeweb/archive/gh-pages.zip
#解压到 /var/keeweb-gh-pages/
$ sudo unzip gh-pages.zip  -d /var/

#然后配置 Caddy, 如果你是用逗比的脚本安装的的话 Caddyfile 应该要放在 /usr/local/caddy/Caddyfile:
$ vim /etc/caddy/Caddyfile

```

```vim
https://kee.kirikira.moe/ {
    gzip
    tls kiri_so@outlook.com
    #记录日志, 可选, 请保证 /var/log/caddy/ 存在
    log / /var/log/caddy/access.log

    #这里是 keeweb 静态文件
    root /var/keeweb-gh-pages

    #把 /dav 路径反代到后面的 WebDav
    proxy /dav 127.0.0.1:8000 {
        #把 path 信息去掉
        without /dav
    }

    #cors 设置, 为什么要这么写我也不知道, 总之先写着啦. 不写的话不影响 WebDav 的工作, 但是会试 KeeWeb 的 WebDav 功能异常
    cors /dav {
    origin *
    methods GET,HEAD,POST,PUT,OPTIONS,MOVE,DELETE,COPY,LOCK,UNLOCK,PROPFIND,MKCOL
    allow_credentials true
    max_age 1728000
    allowed_headers Authorization,DNT,X-CustomHeader,Keep-Alive,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,X-Accept-Charset,X-Accept,origin,accept,if-match,destination,overwrite
    exposed_headers ETag
    }
}
```

完事儿以后重启 Caddy:

```bash
$ sudo systemctl restart caddy
```

现在在浏览器里直接打开你的域名就能看到 KeeWeb, 而在 KeeWeb 里先点击 More, 然后选择 WebDav 方式, 会要你填写 url 和账号密码, url 要这样写:

> https://kee.kirikira.moe/dav/NewDatabase.kdbx

__注意最后一定是以. kdbx 结尾的!__

大功告成啦~~~~

差点忘了, 最后记得开启你 8000 端口的防火墙来阻止外部扫描, ubuntu 可以用 ufw:

```bash
$ sudo ufw deny 8000
```

完结撒花~ 这篇写了我一晚上, 累死了.
