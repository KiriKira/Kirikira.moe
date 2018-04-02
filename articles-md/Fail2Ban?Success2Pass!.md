Fail2Ban? Success2Pass!
==========

Fail2Ban 的大名估计是个接触过服务器的人都听说过, 最常见的应用情景可能就是防止 SSH 爆破了. 不过我其实一直搞不懂这有什么卵用, 如果怕被爆破出来那只允许密钥登录不久好了? 如果已经纯密钥了还是不想看到日志里发现被人扫了, 这种强迫症还是算惹. 而另外的一些应用情景, fail2ban 又显得有些力不从心了: 我搭建了监听在公网的服务, 例如 DNS, SNIPorxy 等等, 又不想被别人滥用(比如前阵子把全球互联网搅成一团西湖烂的 Memcached 攻击就是因为一帮人瞎 JB 监听公网又不加限制), 而这些无身份验证过程的服务本来就没有 fail 的概念也就没法 ban 了, 并且我是一个没有固定的 ip (拨号上网拨一下一个ip, 或者经常出门在外, 用的是流量等等等等)的人, 甚至我还希望我的手机就能完成一系列操作不需要什么复杂的骚操作, fail2ban 怎么能满足的了呢? 既然 fail2ban 不好用, 我们不如来想一想它的反义词 -- Success2Pass!

顾名思义, 我们现在想要做的事, 是让防火墙默认拒绝所有的ip, 而通过一些其他的方式让防火墙对我们开放. 这个想法已经有一些实现了, 例如 Port Knocking 就是通过跟服务器约定一套"暗号"以后临时开放端口(比如先给服务器连续发送四个包之后就开放22端口), 但是在我看来这种看似炫酷的操作既不清真也不优雅, 何况也无法满足第一段提到的"手机也能用". 既然如此, 我觉得使用 HTTP API 来做这个事是非常合适的.

好了, 说做就做, 我们会发现实现这个需求是多么简单.

先体验一下?

#注: 以下操作都默认在root用户进行

-----------

我用单文件的 Django 写了一个 [demo](https://github.com/KiriKira/scripts/tree/master/success2pass) 放在了 gayhub. 不要问我为什么这么简单的东西要用 Django 这样的框架来写, 我就是想要玩单文件 Django 嘛哼! 不想用自己写去(跑

把项目 clone 到本地(当然实际上你也可以只下载对应的文件, 也就是 success2pass.py 和 uwsgi.xml 这两个):

```bash
# 总之先确保你有 git
# $ apt-get update && apt-get install git
$ git clone https://github.com/KiriKira/scripts/
$ cd scripts/success2pass
```

安装依赖:

```bash
$ apt-get install python3-pip
# 别告诉我你连 python3 都没有哦
$ pip3 install pipenv
$ pipenv install
# 实际上用到的依赖就是 django==1.8 和 python3 的 uwsgi, 所以如果你不想用pipenv的话也可以手动装上
# $ pip3 install django==1.8 uwsgi
```

测试一下效果:

```bash
# 激活虚拟环境, 如果你在上一步中采用了注释里的直接安装依赖, 可以跳过这个命令, 然后在接下来用 python3 命令代替 python 命令来钦定 python3, 防止调用 python2
$ pipenv shell
# 运行 Django 自带的 webserver
$ python success2pass.py runserver 0.0.0.0:8000
```

好了, 现在直接在你的浏览器里打开 <http://ip:8000/s2ptest> (记得现在先让你服务器的 8000 端口开放), 你会看到:

![s2ptest的截图](https://i.yusa.me/YBt2YxMb0l4e.png
)

表明我们的 api 能成功 get 到我们的 ip 并且正确处理啦~

正经地部署
--------------

上面我们调用了 Django 自带的 webserver, 它已经可以处理一些简单的请求, 不过它本质上只是一个开发用的服务器, 直接暴露在公网也是不明智的.所以我们用稍微专业一点的 uwsgi 来负责启动 Django:

修改一下同一个文件夹里的 <red> uwsgi.xml </red> :

```xml
    # 这行表示我们的 uwsgi 将会监听在公网的 8001 端口
    <http>:8001</http>

    # 这个就改成你当前的路径
    <chdir>/home/kiri/projects/scripts/success2pass</chdir>

    # 这个也是
    <pidfile>/home/kiri/projects/scripts/success2pass/file.pid</pidfile>
```

然后把 success2pass.py 里面的 DEBUG 模式关掉!:

```python
setting = {
    'DEBUG': False,
    'ROOT_URLCONF': __name__
}
# 改完你还可以顺便注意一下下面的 CMD_TEMPLATE 这个变量, 它是我们 API 会向系统调用的命令
```

启动 uwsgi:

```bash
$ uwsgi -x uwsgi.xml
```

如果一切正常的话, 现在在浏览器访问 <http://ip:8001/s2ptest> 你也可以得到跟刚刚一样的应答了.

uwsgi 本身其实已经是一个相对完善的 webserver了, 就跟你的 nginx/apache/caddy 一样, 你可以直接把它监听在 80 端口, 但因为很多原因, 我们更习惯用 nginx/apache/caddy 或者说已经在用了, 那么我们就只需要把 nginx/caddy 放在前面监听 80 和 443, 然后反代后面的 uwsgi 就行了:

nginx:

```nginx
#在你原来的配置里加上
location /s2p {
    proxy_pass http://127.0.0.1:8001;
}

```

caddy:

```caddy
#加一行
proxy /s2p 127.0.0.1:8001
```

就可以啦~ 只要你是一个稍有点建站经验, 我相信webserver的配置你是不会陌生的.

配置防火墙
----------

终于把我们的 api 搭完了, 现在开始做我们最开始的目标: 调教防火墙! 为了方便起见, 本文的防火墙也用我常用的 ufw 来作为示例(ufw 是一个 iptables 的前端, 很多时候比起直接用 iptables 还是方便一点), 你也可以跟我一样. 如果你只想用 iptables 或者 firewalld, 可以只看看这一节然后去看下一节.

```bash
# 总之先把 ufw 装上吧
$ apt-get install ufw
# 这条命令将表示默认拒绝所有没特指定的端口和协议, 如果你是第一次使用, 建议不要直接部署在生产环境! 以免一不小心翻车了等会 ssh 都连不上要用 VNC 去救!
$ ufw default deny
# 允许一些本来就是要监听公网的端口
$ ufw allow 80
$ ufw allow 443
# 如果你在上一步里采用 nginx/caddy 反代了 uwsgi , 那么是不需要开放8001端口给公网的.
$ ufw allow 8001
```

然后, ufw 启动! 胆子小怕翻车的话在这一步之前请务必小心, 或者在测试完毕之前不要断开 ssh 连接!

```bash
$ ufw enable
```

然后在浏览器里访问你的 <http://ip:8001/s2p> (如果你是单uwsgi监听8001端口的话), 或者 <https://example.com/s2p> (如果你是用的 nginx/caddy 反代的话), 你会看到:

![s2p截图](https://i.yusa.me/loil3M0KJbKl.png
)

再新建一个 ssh 连接试试看, 能连上服务器了嘛?

最后的订制自己的 Success2Pass
------------

想要知道最后一步我们的 api 对防火墙做了什么, 我们直接打开源码  [success2pass](https://github.com/KiriKira/scripts/blob/master/success2pass/success2pass.py) 看一下, 这一行就是全部了:

```python
CMD_TEMPLATE = "ufw allow from {}"
```

<red>{}</red> 是我们给 ip 地址预留下来的, 当客户端向服务器发起了请求, 如果 path 匹配上了 /s2p/ , 我们就用 `get_client_ip()` 这个函数拿到 ip 地址并且填进刚刚的 CMD_TEMPLATE 里, 最后通过 `subprocess.call()` 来调用完整的命令.

现在你就知道你如果用的是 firewalld 或者 iptables 的话要怎么办了吧? 自己改一下 CMD_TEMPLATE 这个变量就好啦. 如果你只想通过 api 开放指定的端口也一样.

还有什么是应该改了最好的? 倒数几行里有个 urlpatterns , 你可以把这里面的 s2p 和 s2ptest 换成随便你喜欢的什么, 把它藏到你网站的一个没人知道的 path 里去. 如果你使用https, 那么这个 path 一般就不会有别人知道了.

又比如我家每次拨号都是一个 ip, 不过好在都在一个或几个段里, 想要每一次把一个 ip 段加进去呢? 你只需要修改一下 get_client_ip() 这个函数, 比如把我注释掉的那两行去掉, 就可以一次把 xxx.xxx.xxx.0/24 这个 ip 段加入防火墙中.

总结
----------

实际上这玩意的源码不过 80 行这么简单, 然而写这篇文章却这么长, 真是累死我了. 本文只是分享一下这种思路, 无意发展成一个大坑(主要还是想玩单文件 Django), 所以并没有独立开一个项目, 如果有什么疑问的话直接来问我啦~

另外, 很多人觉得 GFW 存在所谓的"主动探测", 尤其是在被害妄想症聚集的 V2Ray 用户中, 可是如果你收集一下你 nginx/caddy 的 log, 除了石锤的对网页代理的探测以外, 还真没有什么能确定是主动探测的请求(如果有, 请告诉我). 不过确实, 防患于未然比什么都不做还是好一点. 于是尽管被后宫们否定, 我仍然觉得有一个可能有点意义的猜想:

这么一个应用场景是非常常见的, 也就是你真的建站的时候, 防火墙只允许CDN 的 ip 和自己家的 ip 而拒绝其他所有连接; 又或者我的几台 Memcached 服务器只允许服务器间和我家通信, 等等, 都是非常合理的. 那么也就是说, 除非 GFW 特地监听着你的请求, 然后用你的 ip 伪造连接, 再根据请求结果来判断, 否则是没法直接判你死刑的. 于是在某种程度上说, iptables 就可以在一定程度上防御所谓的主动探测了. 关于这一点, 还是自己斟酌吧~