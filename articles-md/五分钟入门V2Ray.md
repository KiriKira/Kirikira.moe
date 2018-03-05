从十九大开始，GFW的节奏变成了每隔一段时间就开始IP大屠杀，每次屠杀结束Telegram的自建梯子用户和机场主都是一片哀嚎，同时流言四起，也有大批人从ss/r转投V2Ray。在前两次屠杀的时候，我都成功躲过一劫，然而这一次还是免不了躺枪了三个ip，其中两个压根不是梯子，一个是曾经喜欢的梯子但现在已经废弃很少用了。看到这副惨状，默默地忍着眼泪给第三个ip套上cdn将就用着，另外两个就先放置play了。

在进入今天的主题之前，有几个明显的谣言即使没有技术，智商逻辑正常的我们也可以判断的出来：

* SS/R已经被精准识别了。

这话你先去跟各大机场主说去。况且真能精准识别的话，还用得着ban ip段殃及池鱼？

* SS/R的http和tls混淆已经被破解了。

混淆这玩意本来就不是过墙用的而是躲某些地区的QoS用的，用混淆本来目的就是为了增加特征而不是减少特征。

* 用了V2Ray就不会被墙了。

那我非梯子被墙去找谁呢。

* 用V2Ray就必须用WS+TLS+Web（+CDN），不然没意义。

我可去你妈的吧.jpg

好了，那既然标题是五分钟入门V2Ray,我们就赶快开始吧。

### **第1步：校准时间**

当你使用VMESS协议是，必须保证本地和服务端的时间差不超过一分钟。实际上，这个时间差对比的是timestamp,为图省事，我们直接把时区修改了

```bash
$cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
$date --set="2018-2-16 16:23:30"
```

其中第二行当然要改成你当前的时间了。

### 第2步：安装V2Ray

不同于SS/R有五花八门的一键脚本，V2Ray官方就有提供一键脚本，支持CentOS7/Debian全系列（含Ubuntu）

```bash
$bash <(curl -L -s https://install.direct/go.sh)
```

### 第3步：选择合适的协议

之前在V2Ray群里有一位大佬做了一张推荐配置图:

![How_To_Choose](https://raw.githubusercontent.com/KiriKira/vTemplate/master/How_To_Choose.jpg)

就我个人来说，我推荐一般情况使用TCP + TLS （+None加密） + 443端口，当你已经有web服务部署时使用WebSocket + TLS + web server, (或者当服务器ip被墙想要用cdn拯救一下的时候使用WebSocket + TLS + web server + cdn)。下面就介绍这两种配置。

### 4.1 TCP+TLS

不考虑自签证书，一般我们要使用TLS的话需要先有一个域名，将它解析到服务器的ip上来，接着我们需要对应域名的证书和密钥。

域名建议去[namecheap](https://www.namecheap.com/)或者别的域名服务商买个便宜的域名，比如.win也就几块钱一年，如果申请.ml,.tk这样的免费域名以后万一被回收了反而麻烦。有一个域名之后，其他的服务器就可以用子域名而不用重新申请了。

证书的话，我们当然可以老老实实去签发机构手动申请，也可以偷懒用[acme.sh](https://github.com/Neilpang/acme.sh)来申请，还可以利用Caddy自动申请证书的特性来获得证书。反正是翻墙用小鸡，多配置一个Caddy的https代理和反向代理岂不美哉～下面就顺便讲一下Caddy，如果已有证书或者不准备用Caddy的可以跳过。

安装Caddy:

```bash
$wget https://raw.githubusercontent.com/ToyoDAdoubi/doubi/master/caddy_install.sh && chmod +x caddy_install.sh && bash caddy_install.sh install http.forwardproxy
```

caddy虽然也有官方提供的安装脚本，不过Toyo的脚本里包含了systemd service配置，所以我们就用他的来装啦。安装完后在默认的service里，Caddy的配置文件位于`/usr/local/caddy/Caddyfile`.编辑Caddy：

    $vim /usr/local/caddy/Caddyfile

    https://sub.example.com:8443  {
    gzip
    tls kiri_so@outlook.com #这里是你的邮箱

    proxy / https://www.google.com #这行表示反代咕果。

    forwardproxy {
        basicauth kiri 41888438 #这里是https正向代理的账号密码
        hide_ip
        }
    }

编辑完以后重启Caddy: 

>`systemctl restart caddy`

在上面的配置文件里，我们让Caddy负责监听8443端口（8443端口是和443端口等同的https用端口，由于我们把443预留给了V2Ray,所以就把8443给Caddy了），同时负责申请证书、反代咕果、提供正向代理。现在，在配置V2Ray之前，你就已经可以在浏览器里通过访问<https://sub.example.com:8443>使用咕果，以及在SwitchyOmega里设置https代理（服务器sub.example.com,端口8443,账号kiri,密码41888438）直接访问想上的网站啦。

如果浏览器可以通过https访问你的域名，那么也说明Caddy也为你申请好了证书。证书和密钥可能位于：
>`/.caddy/acme/acme-v01.api.letsencrypt.org/sites/sub.example.com/sub.example.com.crt`  
>`/.caddy/acme/acme-v01.api.letsencrypt.org/sites/sub.example.com/sub.example.com.key`

如果不是的话，可以用`find / -name *sub.example.com*`来寻找

接着我们来配置V2Ray，欢迎使用模板项目[vTemplate](https://git.io/kiri)来寻找对应的配置模板。比如现在我们要用TCP-TLS：

```bash
$cd /etc/v2ray/
$wget -O config.json       https://raw.githubusercontent.com/KiriKira/vTemplate/master/TCP%2BTLS/config_server.json
$vim config.json
```

我们需要改三个地方：uuid,tls\_certificateFile和tls\_keyFile,相信视力正常的你能找到这三个地方在哪里。uuid我们可以[在线生成](https://www.uuidgenerator.net/),或者直接在命令行中生成。使用`uuidgen`或者请python帮我们生成：

```bash
$python
>>> import uuid
>>> uuid.uuid1()
```

编辑完config.json以后，使用`systemctl restart v2ray`来重启V2Ray，再用`systemctl status v2ray`来看看V2Ray启动成功了没有。如果启动失败的话，大概率是你的json格式不对，请检查一下 __逗号__ 的大小写、有没有忘记加 __引号__ 之类的细节。这样，V2Ray服务端就配置完了。

### 4.2 WS+TLS+Web

当我们已有网站部署并且准备将 V2Ray 隐藏在网站后面时，就可以让 Web Server，例如 Nginx/Caddy 来把流量分流给V2Ray。重申一遍我的立场，如果没有真网站就不要放个假网站上去再用WSS，__因为WS往往会比纯TCP-VMESS要慢__，即使要放也请放个Aria2面板之类的有点用处的东西上去而不是放个毫无意义的静态网页。

我们采用根据path分流的方法，例如通过设置设置Nginx/Caddy，将所有对https://sub.example.com/test/ 的流量传给后端的V2Ray, 而所有不是/test/ 的请求则正常应答，这样在外部看来就是完全正常的一个网站流量了。

如果使用Nginx, 在配置文件里添加：
```
location /test/ {
        proxy_redirect off;
        proxy_pass http://127.0.0.1:1234; #把V2Ray监听在1234端口
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $http_host;
        }
```

如果用Caddy, 就添加：
```
proxy /test/ 127.0.0.1:1234 {
    websocket
    header_upstream -Origin
  }
```

最后再配置V2Ray：
```bash
$cd /etc/v2ray/
$wget -O config.json       https://raw.githubusercontent.com/KiriKira/vTemplate/master/websocket%2BCaddy%2BTLS\(use%20path\)/config_server.json
$vim config.json
```

这次我们要修改的就只有config.json中的uuid，注意TLS的拆装由Web Server完成，不需要再在V2Ray中配置TLS！生成uuid的办法跟$4.1一样。

### 第五步：配置客户端

最后我们就来配置V2Ray的客户端啦。

* Android: BifrostV(推荐)、 V2RayNG(推荐)、 Actinium、 V2RayGO
* ios: Kitsunebi、 Pepi、 Shadowrocket

安装客户端以后该填啥填啥，我相信你能看的懂。至于在电脑上使用的话，推荐直接用Core，客户端json文件也可以参考[vTemplate](https://git.io/kiri)

到这里就大功告成啦～～～最后祝您，身体健康……啊不对，祝您参考更多V2Ray的文档和教程：

官方文档 : <https://v2ray.com>

白话文教程 : <https://toutyrater.github.io/>

模板 : <https://git.io/kiri>